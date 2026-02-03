#!/bin/bash
# Navigate to the directory where the script is located
cd "$(dirname "$0")"

# clears the pycahce
echo "Clearing __pycache__ directories..."
rm -rf __pycache__


# Kill any existing instance to prevent port conflicts
echo "Stopping any existing service..."
pkill -9 -f "python3 service.py"

# wait 1s before restarting
sleep 1

# Run the python script in the background
# We use the full path to the python3 binary
echo "(re)starting the service..."
nohup python3 service.py > /dev/null 2>&1 &
