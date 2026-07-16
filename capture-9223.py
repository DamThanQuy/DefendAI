import urllib.request, json, websocket, time
tabs = json.load(urllib.request.urlopen('http://localhost:9223/json'))
target = None
for t in tabs:
    if 'localhost:3000/login' in t.get('url',''):
        target = t; break
if not target:
    print("NO LOGIN TAB"); exit()
ws = websocket.create_connection(target['webSocketDebuggerUrl'])
ws.send(json.dumps({"id":1,"method":"Runtime.enable"}))
ws.send(json.dumps({"id":2,"method":"Log.enable"}))
f = open('console-9223.log','w',encoding='utf-8')
print("Capturing to console-9223.log...", flush=True)
ws.settimeout(1)
end = time.time() + 45
try:
    while time.time() < end:
        try: msg = ws.recv()
        except: continue
        d = json.loads(msg)
        m = d.get('method','')
        if m in ('Runtime.consoleAPICalled','Log.entryAdded'):
            p = d.get('params',{})
            if m=='Runtime.consoleAPICalled':
                typ=p.get('type',''); text=' '.join(a.get('value',a.get('description','')) for a in p.get('args',[]) if isinstance(a,dict))
            else:
                typ=p.get('level',''); text=p.get('text','')
            if text:
                line=f"[{typ.upper()}] {text}\n"; f.write(line); f.flush(); print(line,end='')
except KeyboardInterrupt: pass
finally:
    f.close(); ws.close()
