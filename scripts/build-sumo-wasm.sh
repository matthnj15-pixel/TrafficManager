#!/usr/bin/env bash
set -euo pipefail

# Run with Emscripten 4.0.23, CMake >= 3.31, and Ninja on PATH.
output=${1:-sumo-wasm}
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$output"

git clone --quiet --depth 1 --branch v3.3.0 https://github.com/apache/xerces-c.git "$work/xerces"
git clone --quiet --depth 1 --branch v1_28_0 https://github.com/eclipse-sumo/sumo.git "$work/sumo"
git -C "$work/xerces" rev-parse HEAD | grep -Fx 31b4b3a06105dcd607db9fda9d1883ad7e489bfe
git -C "$work/sumo" rev-parse HEAD | grep -Fx daf91b5578901d599ac9af53f49d26eeb9aefc3b

# SUMO defines native pthread and shared-library targets. The browser
# build uses static libraries and runs each simulator in one worker.
sed -i '/^cmake_minimum_required/a cmake_policy(SET CMP0164 OLD)' "$work/sumo/CMakeLists.txt"
sed -i 's/ -pthread -Wall/ -Wall/; /^install(EXPORT SUMOConfig /d' "$work/sumo/CMakeLists.txt"
sed -i '/^export(EXPORT SUMOConfig /d' "$work/sumo/src/CMakeLists.txt"

# The upstream no-zlib branch uses a stale parameter and needs <fstream>.
sed -i '/^#include <iostream>/a #include <fstream>' "$work/sumo/src/utils/iodevices/OutputDevice_File.cpp"
sed -i '/^    UNUSED_PARAMETER(compressed);/d' "$work/sumo/src/utils/iodevices/OutputDevice_File.cpp"

emcmake cmake -S "$work/xerces" -B "$work/xb" -G Ninja \
  -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -Dnetwork=OFF -Dthreads=OFF -Dtranscoder=iconv
cmake --build "$work/xb" --target xerces-c --parallel "${SUMO_BUILD_JOBS:-4}"

link_flags="-fexceptions -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web,worker -sINVOKE_RUN=0 -sEXIT_RUNTIME=0"
link_flags+=" -sALLOW_MEMORY_GROWTH=1 -sEXPORTED_RUNTIME_METHODS=FS,callMain -sFORCE_FILESYSTEM=1"
emcmake cmake -S "$work/sumo" -B "$work/sb" -G Ninja \
  -DCMAKE_BUILD_TYPE=Release -DCMAKE_CXX_FLAGS=-fexceptions '-DCMAKE_CXX_FLAGS_RELEASE=-O1 -DNDEBUG' \
  "-DCMAKE_EXE_LINKER_FLAGS=$link_flags" -DISOLATED_BUILD=ON -DCHECK_OPTIONAL_LIBS=OFF \
  -DENABLE_FMI=OFF -DENABLE_NETEDIT=OFF -DENABLE_PYTHON_BINDINGS=OFF -DENABLE_JAVA_BINDINGS=OFF \
  -DENABLE_CS_BINDINGS=OFF -DENABLE_PROJ=OFF -DENABLE_FOX=OFF -DENABLE_EIGEN=OFF -DENABLE_FMT=OFF \
  -DENABLE_GTEST=OFF -DENABLE_PARQUET=OFF "-DXercesC_INCLUDE_DIR=$work/xerces/src;$work/xb/src" \
  "-DXercesC_LIBRARY=$work/xb/src/libxerces-c.a" -DXercesC_VERSION=3.3.0
cmake --build "$work/sb" --target sumo netconvert --parallel "${SUMO_BUILD_JOBS:-4}"
for tool in sumo netconvert; do
  cp "$work/sb/src/$tool.js" "$output/$tool.mjs"
  cp "$work/sb/src/$tool.wasm" "$output/$tool.wasm"
done
cp "$work/sumo/LICENSE" "$output/SUMO-LICENSE"
cp "$work/sumo/NOTICE.md" "$output/SUMO-NOTICE.md"
cp "$work/xerces/LICENSE" "$output/XERCES-LICENSE"
cp "$work/xerces/NOTICE" "$output/XERCES-NOTICE"
