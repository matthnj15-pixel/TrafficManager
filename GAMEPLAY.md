# Traffic Manager gameplay

1. **Read the demand.** Each scenario supplies fixed street and property connections. Hold a connection to see its scheduled destinations and trip counts, even on a cleared map.
2. **Lay out the network.** Clear the map to keep the required connection nodes, their short road stubs, and the surrounding landscape. Draw roads from those connections, place junctions in open space, and split existing roads to add branches.
3. **Design around the site.** The school, houses, fields, and trees occupy real space. Road width and curvature count when checking whether a road fits. At-grade crossings need a shared junction.
4. **Set the traffic rules.** Roads carry lane counts in each direction. Junction controls let you test priority, an all-way stop, or an automatically timed signal. Lane counts affect the network SUMO actually simulates.
5. **Run and revise.** Compare the design with the original using the same trip schedule. Disconnected trips count as unserved. Use queues, delay, completions, and collisions to decide what to change.

School Pickup includes north, south, west, and east street connections, school access, and the pickup loop. Each location uses one connection for incoming and outgoing demand. The original corridor also supports its dedicated lane-attachment, taper, slip-lane, and signal controls.
