#!/bin/bash

# Load nvm if present (handles nodes where node is installed via nvm rather than apt)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

while true; do
   node run

   echo "Restarting in 5 seconds..."
   echo "Press CTRL + C to stop."
   sleep 5
done
