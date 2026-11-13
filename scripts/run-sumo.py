#!/usr/bin/env python3
"""Run both Traffic Manager designs using native Eclipse SUMO."""
import argparse
from collections import defaultdict
import json
import math
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory
import xml.etree.ElementTree as ET


def element(parent, tag, **attributes):
    return ET.SubElement(parent, tag, {key: str(value) for key, value in attributes.items()})


def write_xml(directory, name, root):
    path = directory / name
    ET.ElementTree(root).write(path, encoding="utf-8", xml_declaration=True)
    return path


def run_command(*command):
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip())
    return result.stdout


def build_inputs(request, layout, directory):
    world = request["world"]
    design = layout["design"]
    scale = request["scale"]
    main = design["lanes"] & 1
    auxiliary = design["lanes"] & 2
    nodes = ET.Element("nodes")
    edges = ET.Element("edges")
    connections = ET.Element("connections")
    routes = ET.Element("routes")
    tls = ET.Element("tlLogics")

    def node(name, x, y, kind="priority"):
        element(nodes, "node", id=name, x=x * scale, y=-y * scale, type=kind, radius=0.5)

    def shape(points):
        return " ".join(f"{x * scale:.4f},{-y * scale:.4f}" for x, y in points)

    def edge(name, start, end, points, speed=14):
        element(edges, "edge", id=name, **{"from": start, "to": end},
                shape=shape(points), speed=speed, spreadType="center", numLanes=1)

    def connect(incoming, outgoing, **attributes):
        element(connections, "connection", **{"from": incoming, "to": outgoing},
                fromLane=0, toLane=0, **attributes)

    outer, inner = world["outer"], world["inner"]
    start, signal, finish = world["south"], world["signal"], world["north"]
    join, end = design["node"], design["mergeEnd"]
    node("south", outer, start, "dead_end")
    node("inner-south", inner, start, "dead_end")
    node("inner-north", inner, finish, "dead_end")
    node("north", outer, finish, "dead_end")
    node("signal", outer, signal, "traffic_light")
    node("join", outer, join, "zipper" if main else "priority")
    node("pickup", *layout["curves"][0]["points"][0], "dead_end")

    edge("avenue", "south", "join", [(outer, start), (outer, join)])
    edge("inner", "inner-south", "signal", [(inner, start), (inner, signal)])
    edge("inner-exit", "signal", "inner-north", [(inner, signal), (inner, finish)])
    edge("exit", "signal", "north", [(outer, signal), (outer, finish)])
    before_signal = "downstream" if auxiliary else "approach"
    edge("approach", "join", "taper" if auxiliary else "signal",
         [(outer, join), (outer, end if auxiliary else signal)])
    connect("avenue", "approach", visibility=25)
    connect(before_signal, "exit")
    connect("inner", "inner-exit")

    # The displayed corridor has one pickup approach, including when both
    # movements are enabled. Give it one entry edge and explicit connections.
    pickup_path = layout["curves"][0 if main else 1]
    edge("pickup-road", "pickup", "join", pickup_path["points"], pickup_path["speed"])
    if main:
        connect("pickup-road", "approach", visibility=25)
    if auxiliary:
        node("taper", outer, end, "zipper")
        edge("merge-lane", "join", "taper",
             [[world["auxiliary"], join], *layout["taper"]], 8)
        edge("downstream", "taper", "signal", [(outer, end), (outer, signal)])
        connect("pickup-road", "merge-lane")
        connect("approach", "downstream", visibility=25)
        connect("merge-lane", "downstream", visibility=25)

    timing = request["signal"]
    logic = element(tls, "tlLogic", id="signal", type="static", programID="0", offset=0)
    element(logic, "phase", duration=timing["green"], state="GG")
    element(logic, "phase", duration=timing["cycle"] - timing["green"], state="rr")

    for name, dimensions in request["types"].items():
        bus = name == "bus"
        element(routes, "vType", id=name, length=dimensions["length"], width=dimensions["width"],
                vClass="bus" if bus else "passenger", minGap=2, sigma=0, tau=1,
                accel=1.05 if bus else 2.1, decel=4.5, maxSpeed=12 if bus else 14,
                speedFactor=1, speedDev=0)
    onward = "approach downstream exit" if auxiliary else "approach exit"
    element(routes, "route", id="outer", edges=f"avenue {onward}")
    element(routes, "route", id="inner", edges="inner inner-exit")
    if main:
        element(routes, "route", id="direct", edges=f"pickup-road {onward}")
    if auxiliary:
        element(routes, "route", id="merge", edges="pickup-road merge-lane downstream exit")

    for trip in request["trips"]:
        route = trip["origin"]
        if route == "ramp":
            route = "direct" if main and (not auxiliary or trip["pickupIndex"] % 2 == 0) else "merge"
        element(routes, "vehicle", id=trip["id"], type=trip["kind"], route=route,
                depart=f'{trip["time"]:.2f}', departSpeed=0, departPos="base")

    net = directory / "corridor.net.xml"
    run_command("netconvert", "--node-files", write_xml(directory, "nodes.xml", nodes),
                "--edge-files", write_xml(directory, "edges.xml", edges),
                "--connection-files", write_xml(directory, "connections.xml", connections),
                "--tllogic-files", write_xml(directory, "signal.xml", tls),
                "--offset.disable-normalization", "--output-file", net)
    return net, write_xml(directory, "routes.xml", routes)


def simulate(request, layout, directory):
    net, routes = build_inputs(request, layout, directory)
    trace = directory / "trace.xml"
    trips = directory / "trips.xml"
    collision_file = directory / "collisions.xml"
    step, duration = request["step"], request["duration"]
    run_command("sumo", "--net-file", net, "--route-files", routes, "--seed", "42",
                "--step-length", str(step), "--end", str(duration + step), "--fcd-output", trace,
                "--precision", "4", "--tripinfo-output", trips, "--tripinfo-output.write-unfinished",
                "--collision-output", collision_file, "--collision.action", "warn",
                "--collision.check-junctions", "--collision.mingap-factor", "0",
                "--time-to-teleport", "-1", "--no-step-log")
    reports = ET.parse(trips).getroot()
    arrivals = sorted(float(trip.get("arrival")) for trip in reports if float(trip.get("arrival")) >= 0)
    bus_count = sum(trip["kind"] == "bus" for trip in request["trips"])
    bus_delay = sum(max(0, float(trip.get("timeLoss"))) + max(0, float(trip.get("departDelay")))
                    for trip in reports if trip.get("vType") == "bus") / bus_count
    collisions = len(ET.parse(collision_file).getroot())
    finished = 0
    peak = 0
    frames = []
    for frame in ET.parse(trace).getroot():
        time = float(frame.get("time"))
        while finished < len(arrivals) and arrivals[finished] <= time:
            finished += 1
        markers = []
        queues = defaultdict(float)
        for vehicle in frame:
            kind = vehicle.get("type")
            length = request["types"][kind]["length"]
            angle = math.radians(float(vehicle.get("angle")) - 90)
            speed = float(vehicle.get("speed"))
            reason = "Queued" if speed < 2.2 else ""
            if reason:
                queues[vehicle.get("lane")] += length + 2
            # SUMO reports the front bumper. Traffic Manager draws the center.
            x = (float(vehicle.get("x")) - math.cos(angle) * length / 2) / request["scale"]
            y = (-float(vehicle.get("y")) - math.sin(angle) * length / 2) / request["scale"]
            markers.append(dict(id=int(vehicle.get("id")), kind=kind, x=round(x, 4),
                                y=round(y, 4), angle=round(angle, 5), speed=speed, reason=reason))
        peak = max(peak, *queues.values()) if queues else peak
        signal = request["signal"]
        frames.append(dict(markers=markers, green=time % signal["cycle"] < signal["green"],
                           finished=finished, longestQueue=peak))
    if len(frames) != round(duration / step) + 1:
        raise RuntimeError(f"SUMO returned {len(frames)} frames for a {duration}s simulation.")
    return dict(design=layout["design"], frames=frames,
                results=dict(finished=finished, waiting=len(request["trips"]) - finished,
                             longestQueue=peak, busDelay=bus_delay, collisions=collisions))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("request", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    try:
        request = json.loads(args.request.read_text())
        if request["schema"] != "traffic-manager.sumo-request.v1":
            raise ValueError("Expected a Traffic Manager SUMO export.")
        version = run_command("sumo", "--version").splitlines()[0]
        with TemporaryDirectory(prefix="traffic-manager-sumo-") as work:
            result = dict(schema="traffic-manager.sumo-comparison.v1", version=version)
            for key in ["original", "edited"]:
                directory = Path(work) / key
                directory.mkdir()
                result[key] = simulate(request, request[key], directory)
        args.output.write_text(json.dumps(result, separators=(",", ":"), allow_nan=False))
        print(version)
        for key in ["original", "edited"]:
            print(f'{key}: {result[key]["results"]}')
        print(args.output)
    except (OSError, KeyError, ValueError, RuntimeError) as error:
        parser.exit(1, f"SUMO comparison failed: {error}\n")


if __name__ == "__main__":
    main()
