import socket
import subprocess
import threading
import os
import sys

def forward_sock_to_proc(sock, stdin_fd):
    try:
        while True:
            data = sock.recv(16384)
            if not data:
                break
            os.write(stdin_fd, data)
    except Exception:
        pass

def forward_proc_to_sock(stdout_fd, sock):
    try:
        while True:
            data = os.read(stdout_fd, 16384)
            if not data:
                break
            sock.sendall(data)
    except Exception:
        pass

def handle_client(client_sock):
    try:
        proc = subprocess.Popen(
            ['wsl.exe', '-d', 'Ubuntu', '-e', 'socat', '-', 'TCP:127.0.0.1:5432'],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            bufsize=0
        )
        t1 = threading.Thread(target=forward_sock_to_proc, args=(client_sock, proc.stdin.fileno()), daemon=True)
        t2 = threading.Thread(target=forward_proc_to_sock, args=(proc.stdout.fileno(), client_sock), daemon=True)
        t1.start()
        t2.start()
        t1.join()
        t2.join()
        proc.terminate()
    except Exception:
        pass
    finally:
        try:
            client_sock.close()
        except Exception:
            pass

def main():
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind(('127.0.0.1', 5432))
    server.listen(128)
    print("PG_PROXY_LISTENING_5432", flush=True)
    while True:
        client, _ = server.accept()
        threading.Thread(target=handle_client, args=(client,), daemon=True).start()

if __name__ == '__main__':
    main()
