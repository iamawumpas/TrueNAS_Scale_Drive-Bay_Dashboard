import socketserver
import threading

from py.server import (
    FastHandler,
    get_port,
    io_monitor_thread,
    topology_scanner_thread,
    alert_monitor_thread,
    pool_activity_monitor_thread,
)

if __name__ == "__main__":
    threading.Thread(target=io_monitor_thread, daemon=True).start()
    threading.Thread(target=topology_scanner_thread, daemon=True).start()
    threading.Thread(target=alert_monitor_thread, daemon=True).start()
    threading.Thread(target=pool_activity_monitor_thread, daemon=True).start()
    socketserver.TCPServer.allow_reuse_address = True
    port = get_port()
    print(f"Starting server on port {port}")
    with socketserver.TCPServer(("0.0.0.0", port), FastHandler) as httpd:
        httpd.serve_forever()