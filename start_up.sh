#!/bin/bash
# Navigate to the directory where the script is located
cd "$(dirname "$0")"

# Kill any existing instance to prevent port conflicts
pkill -f service.py

# Run the python script in the background
# We use the full path to the python3 binary
/usr/bin/python3 service.py > /dev/null 2>&1 &