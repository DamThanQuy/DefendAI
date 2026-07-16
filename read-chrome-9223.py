import urllib.request, json, websocket, time, sys

def get_tabs():
    return json.load(urllib.request.urlopen('http://localhost:9223/json'))

def find_tab(keyword):
    for t in get_tabs():
        if keyword in t.get('url','') or keyword in t.get('title',''):
            return t
    return None

# Tìm tab login
tab = find_tab('localhost:3000/login')
if not tab:
    print("No login tab found"); sys.exit(1)

ws_url = tab['webSocketDebuggerUrl']
ws = websocket.create_connection(ws_url)
print(f"Connected to tab: {tab['url']}")

# Enable Runtime + Log + Console
ws.send(json.dumps({"id":1,"method":"Runtime.enable"}))
ws.send(json.dumps({"id":2,"method":"Log.enable"}))

print("Listening for console messages (Ctrl+C to stop)...")
try:
    while True:
        ws.settimeout(2)
        try:
            msg = ws.recv()
        except Exception:
            continue
        data = json.loads(msg)
        method = data.get('method','')
        if method in ('Runtime.consoleAPICalled','Log.entryAdded'):
            params = data.get('params',{})
            if method == 'Runtime.consoleAPICalled':
                typ = params.get('type','')
                args = params.get('args',[])
                text = ' '.join(a.get('value', a.get('description','')) for a in args if isinstance(a,dict))
            else:
                typ = params.get('level','')
                text = params.get('text','')
            if text:
                print(f"[{typ.upper()}] {text}")
        elif 'error' in data:
            print(f"[WS-ERR] {data['error']}")
except KeyboardInterrupt:
    print("\nStopped")
finally:
    ws.close()
