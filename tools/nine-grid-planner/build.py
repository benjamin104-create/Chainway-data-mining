"""把 index.html（Artifact 預覽版）包成可安裝的網站版，輸出到 site/index.html。

用法：python build.py [公開網址]
公開網址會顯示在預覽版的「放到手機桌面」說明裡；網站版本身不需要。
"""
import pathlib
import sys

HERE = pathlib.Path(__file__).parent
page = (HERE / "index.html").read_text(encoding="utf-8")
site_url = sys.argv[1] if len(sys.argv) > 1 else ""

head = """<!doctype html>
<html lang="zh-Hant-TW">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#FFFFFF">
<meta name="description" content="九宮格週計畫：把一週的待辦放進九個格子，含國定假日提醒、語音提醒與自訂桌布。">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="icon-180.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="九宮格">
<script>window.NG_SITE=true;window.NG_SITE_URL=%s;</script>
<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}img{max-width:100%%}[hidden]{display:none!important}</style>
""" % repr(site_url).replace("'", '"')

# the page starts with <title> and <style>; keep them in <head>, the rest goes in <body>
split = page.index('<div id="wall">')
out = head + page[:split] + "</head>\n<body>\n" + page[split:] + "\n</body>\n</html>\n"
(HERE / "site" / "index.html").write_text(out, encoding="utf-8")
print("wrote site/index.html", len(out), "bytes")
