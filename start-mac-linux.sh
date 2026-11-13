#!/bin/sh
# Starts the Card Hub on this computer: http://127.0.0.1:8080/  (Ctrl+C to stop)
cd "$(dirname "$0")"
node server/server.js
