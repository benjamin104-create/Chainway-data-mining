#!/usr/bin/env python3
"""產生兌換碼：python3 make-code.py course:all fit:all
印出一組新兌換碼（給客人）和要貼進 index.html OWNER.codes 的那一行（只放雜湊，網站上看不到原碼）。
權益代號：pic:<大類>（例 pic:world）、pic:all、course:<課程>（k1000 hs3000 travel exam）、course:all、
          fit:<部位>、fit:all、deck:<字卡組>、wk:<方向>-<分鐘>（例 wk:dance-20）、
          course:grammar、course:pattern、course:slang（文法・句型・俚語篇）、
          studio:ai（AI 工作室：AI 造型師＋AI 設計背景）、outfit:all（衣櫃全部解鎖）、
          ai:plus（AI 加值包：網站的 AI 每天可用次數變多）"""
import hashlib, secrets, sys, json
grants = sys.argv[1:] or ["course:all"]
code = "-".join(secrets.token_hex(2).upper() for _ in range(3))
h = hashlib.sha256(code.encode()).hexdigest()
print("兌換碼（給客人）：", code)
print("貼進 OWNER.codes：")
print(f'  "{h}":{json.dumps({"grants": grants})},')
if any(g.startswith("ai:") for g in grants):
    print()
    print("這是 AI 加值包：還要把下面這串加進 Netlify 的環境變數 AI_PASS_HASHES")
    print("（已經有值的話，用英文逗號接在後面），伺服器才會放寬這組碼的次數：")
    print(f"  {h}")
