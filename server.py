#!/usr/bin/env python3
# 개발용 정적 서버 — 캐시를 끄고(no-store) 이 파일이 있는 폴더를 서빙
import http.server, socketserver, os

os.chdir(os.path.dirname(os.path.abspath(__file__)))
PORT = int(os.environ.get('PORT', 8078))


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()


with socketserver.TCPServer(('', PORT), Handler) as httpd:
    print(f'serving {os.getcwd()} on http://localhost:{PORT} (no-cache)')
    httpd.serve_forever()
