# -*- coding: utf-8 -*-
from flask import Flask, request, jsonify
from flask_cors import CORS
import re
import json

try:
    from groq import Groq
    GROQ_AVAILABLE = True
except ImportError:
    GROQ_AVAILABLE = False
    print("Groq not installed. Run: pip install groq")

app = Flask(__name__)
CORS(app, origins="*", allow_headers=["Content-Type", "Authorization"], methods=["GET", "POST", "OPTIONS"])


# ✅ CORRECT
from dotenv import load_dotenv
load_dotenv()
GROQ_KEY = os.environ.get("GROQ_API_KEY", "")
client = Groq(api_key=GROQ_KEY)

def get_groq_client():
    if GROQ_AVAILABLE and GROQ_KEY and len(GROQ_KEY) > 10:
        return Groq(api_key=GROQ_KEY)
    return None

def groq_chat(system, user, max_tokens=2000):
    client = get_groq_client()
    if not client:
        return None
    try:
        resp = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role":"system","content":system},{"role":"user","content":user}],
            temperature=0.3, max_tokens=max_tokens
        )
        return resp.choices[0].message.content.strip()
    except Exception as e:
        print(f"Groq error: {e}")
        return None

def clean_json(raw):
    raw = re.sub(r'^```[a-z]*\n?', '', raw).rstrip('`').strip()
    return json.loads(raw)

# ===== LANGUAGE DETECTION =====
def detect_language(code):
    code_lower = code.lower()
    if re.search(r'<!DOCTYPE\s+html|<html>|<head>|<body>', code_lower): return 'html'
    if re.search(r'\{[^}]*:[^}]*;\s*\}', code) and ('color:' in code_lower or 'margin:' in code_lower): return 'css'
    if re.search(r'public\s+class|private\s+\w+|System\.out\.print|String\[\]|@Override', code): return 'java'
    if re.search(r'#include\s*<[^>]+>|std::|cout\s*<<|cin\s*>>', code): return 'cpp'
    if re.search(r'using\s+System;|Console\.WriteLine', code) and 'static void Main' in code: return 'csharp'
    if re.search(r'SELECT\s+.*\s+FROM|INSERT\s+INTO|CREATE\s+TABLE', code.upper()): return 'sql'
    if re.search(r'function\s*\w+\s*\(|const\s+\w+\s*=|let\s+\w+|=>|document\.', code):
        if 'react' in code_lower or 'useState' in code: return 'react'
        return 'javascript'
    if re.search(r'<\?php|\$_[A-Z]+\s*\[|\becho\s+', code): return 'php'
    return 'python'

# ===== REGEX EXPLAINERS =====
def explain_line(line, line_num, language):
    L = line.strip()
    if not L: return None

    if language == 'java':
        if re.search(r'public\s+class', L):
            n = re.search(r'class\s+(\w+)', L)
            return {"lineNum": line_num, "icon": "🏛️", "text": f"Class '{n.group(1) if n else 'class'}' — blueprint for objects"}
        if re.search(r'public\s+static\s+void\s+main', L):
            return {"lineNum": line_num, "icon": "🚀", "text": "main() — program entry point"}
        if re.search(r'System\.out\.print', L):
            return {"lineNum": line_num, "icon": "🖨️", "text": "Prints output to the console"}
        if re.search(r'private\s+', L):
            return {"lineNum": line_num, "icon": "🔒", "text": "Private — accessible only within this class"}
        if re.search(r'public\s+', L):
            return {"lineNum": line_num, "icon": "🌍", "text": "Public — accessible from anywhere"}
        if re.search(r'new\s+\w+\s*\(', L):
            n = re.search(r'new\s+(\w+)', L)
            return {"lineNum": line_num, "icon": "🏗️", "text": f"Creates new '{n.group(1) if n else 'object'}' instance"}
        if re.search(r'this\.', L):
            return {"lineNum": line_num, "icon": "👆", "text": "'this' refers to current object instance"}
        if re.search(r'for\s*\(', L):
            return {"lineNum": line_num, "icon": "🔁", "text": "For loop — repeats a block of code"}
        if re.search(r'if\s*\(', L):
            return {"lineNum": line_num, "icon": "❓", "text": "Conditional — runs code if condition is true"}
        if re.search(r'return\s+', L):
            return {"lineNum": line_num, "icon": "📤", "text": "Returns a value from the method"}
        if re.search(r'import\s+java\.', L):
            return {"lineNum": line_num, "icon": "🧩", "text": "Imports Java library class"}
        if re.search(r'//', L):
            return {"lineNum": line_num, "icon": "💬", "text": "Comment — developer note, not executed"}
        return {"lineNum": line_num, "icon": "⚙️", "text": "Java statement — executes an instruction"}

    if language == 'python':
        if re.search(r'def\s+', L):
            n = re.search(r'def\s+(\w+)', L)
            return {"lineNum": line_num, "icon": "⚙️", "text": f"Defines function '{n.group(1) if n else 'func'}'"}
        if re.search(r'class\s+', L):
            n = re.search(r'class\s+(\w+)', L)
            return {"lineNum": line_num, "icon": "🏛️", "text": f"Defines class '{n.group(1) if n else 'class'}'"}
        if re.search(r'print\(', L):
            return {"lineNum": line_num, "icon": "🖨️", "text": "Prints output to the console"}
        if re.search(r'for\s+\w+\s+in\s+', L):
            return {"lineNum": line_num, "icon": "🔁", "text": "For loop — iterates over a sequence"}
        if re.search(r'while\s+', L):
            return {"lineNum": line_num, "icon": "🔁", "text": "While loop — repeats while condition is true"}
        if re.search(r'^if\s+', L):
            return {"lineNum": line_num, "icon": "❓", "text": "If condition — runs code when condition is True"}
        if re.search(r'^elif\s+', L):
            return {"lineNum": line_num, "icon": "❓", "text": "Elif — checks another condition"}
        if re.search(r'^else\s*:', L):
            return {"lineNum": line_num, "icon": "❓", "text": "Else — runs when all conditions are False"}
        if re.search(r'^import\s+|^from\s+', L):
            return {"lineNum": line_num, "icon": "🧩", "text": "Imports external module"}
        if re.search(r'return\s+', L):
            return {"lineNum": line_num, "icon": "📤", "text": "Returns value from function"}
        if re.search(r'^#', L):
            return {"lineNum": line_num, "icon": "💬", "text": "Comment — developer note"}
        if re.search(r'=\s*[^=]', L) and not re.search(r'==', L):
            n = re.search(r'(\w+)\s*=', L)
            return {"lineNum": line_num, "icon": "📦", "text": f"Assigns value to '{n.group(1) if n else 'variable'}'"}
        return {"lineNum": line_num, "icon": "⚙️", "text": "Python statement"}

    if language == 'javascript':
        if re.search(r'function\s+', L):
            n = re.search(r'function\s+(\w+)', L)
            return {"lineNum": line_num, "icon": "⚙️", "text": f"Function '{n.group(1) if n else 'func'}' — reusable code block"}
        if re.search(r'const\s+', L):
            n = re.search(r'const\s+(\w+)', L)
            return {"lineNum": line_num, "icon": "🔒", "text": f"Constant '{n.group(1) if n else 'var'}' — cannot be reassigned"}
        if re.search(r'let\s+', L):
            n = re.search(r'let\s+(\w+)', L)
            return {"lineNum": line_num, "icon": "📦", "text": f"Variable '{n.group(1) if n else 'var'}' — mutable value"}
        if re.search(r'document\.getElementById', L):
            return {"lineNum": line_num, "icon": "🔍", "text": "Finds HTML element by ID"}
        if re.search(r'addEventListener', L):
            return {"lineNum": line_num, "icon": "👂", "text": "Listens for user event (click, keypress...)"}
        if re.search(r'console\.log', L):
            return {"lineNum": line_num, "icon": "🖨️", "text": "Logs value to browser console for debugging"}
        if re.search(r'=>', L):
            return {"lineNum": line_num, "icon": "🏹", "text": "Arrow function — modern concise function syntax"}
        if re.search(r'if\s*\(', L):
            return {"lineNum": line_num, "icon": "❓", "text": "Conditional — executes code if condition is true"}
        if re.search(r'for\s*\(', L):
            return {"lineNum": line_num, "icon": "🔁", "text": "For loop — repeats code block"}
        if re.search(r'return\s+', L):
            return {"lineNum": line_num, "icon": "📤", "text": "Returns value from function"}
        return {"lineNum": line_num, "icon": "⚙️", "text": "JavaScript statement"}

    return {"lineNum": line_num, "icon": "⚙️", "text": "Executes a statement"}

def regex_analyze(code):
    language = detect_language(code)
    lines_out = []
    for i, line in enumerate(code.split('\n')):
        result = explain_line(line, i+1, language)
        if result:
            lines_out.append(result)

    non_empty = len([l for l in code.split('\n') if l.strip()])
    has_input = bool(re.search(r'\binput\s*\(|\bscanf|\bScanner|\bcin\b', code, re.I))
    has_print = bool(re.search(r'\bprint\s*\(|\bconsole\.log|\bSystem\.out|\bcout\b', code, re.I))
    has_return = bool(re.search(r'\breturn\b', code))

    concepts = []
    if re.search(r'\bfor\b', code): concepts.append("for loop")
    if re.search(r'\bwhile\b', code): concepts.append("while loop")
    if re.search(r'\bif\b', code): concepts.append("conditionals")
    if re.search(r'\bdef\b|\bfunction\b', code): concepts.append("functions")
    if re.search(r'\bclass\b', code): concepts.append("classes / OOP")
    if re.search(r'\bimport\b', code): concepts.append("modules")
    if re.search(r'try|except|catch', code): concepts.append("exception handling")
    if not concepts: concepts = [f"{language} syntax"]

    difficulty = "Beginner" if non_empty <= 15 else "Intermediate" if non_empty <= 40 else "Advanced"
    tips = {'java':"Think in terms of classes and objects",'python':"Use print() to trace values step by step",
            'javascript':"Use console.log() to debug",'html':"Add CSS to style your structure",
            'css':"Try flexbox for powerful layouts",'sql':"Practice SELECT queries first"}

    viva = [
        {"question": f"What does this {language.upper()} program do overall?", "hint": "Describe the main purpose in 2-3 sentences.", "difficulty": "Easy"},
        {"question": "Walk me through the code line by line.", "hint": "Start from top, explain each block.", "difficulty": "Easy"},
        {"question": "What would happen if you removed the main function/method?", "hint": "Think about entry points and program flow.", "difficulty": "Medium"},
        {"question": "What are the inputs and outputs of this program?", "hint": "Look for input() / Scanner / print / return statements.", "difficulty": "Easy"},
        {"question": "What happens if invalid input is given?", "hint": "Check for error handling or validation logic.", "difficulty": "Medium"},
        {"question": "How would you improve this code?", "hint": "Think about error handling, efficiency, readability.", "difficulty": "Hard"},
        {"question": "What CS concepts are demonstrated here?", "hint": ", ".join(concepts), "difficulty": "Medium"},
        {"question": "Can you rewrite a part of this more efficiently?", "hint": "Look for repeated code or nested loops.", "difficulty": "Hard"},
    ]

    return {
        "language": language.upper(),
        "lines": lines_out,
        "overview": {
            "purpose": f"A {difficulty.lower()}-level {language.upper()} program with {non_empty} lines.",
            "input": "User keyboard input" if has_input else "No direct user input",
            "output": "Prints to console" if has_print else ("Returns a value" if has_return else "No explicit output"),
            "concepts": concepts[:6],
            "difficulty": difficulty,
            "tip": tips.get(language, "Keep practicing!")
        },
        "viva": viva
    }

# ===== ROUTES =====

@app.route('/explain-ai', methods=['POST','OPTIONS'])
def explain_code_ai():
    if request.method == 'OPTIONS': return '', 200
    data = request.get_json()
    if not data: return jsonify({"error": "No data"}), 400
    code = data.get('code','').strip()
    if not code: return jsonify({"error": "No code"}), 400

    lines_count = len([l for l in code.split('\n') if l.strip()])

    # For large files (>30 lines): use regex for line-by-line, Groq for overview+viva only
    # For small files (<= 30 lines): ask Groq for everything
    if lines_count > 30:
        # Get regex line explanations (always complete)
        regex_result = regex_analyze(code)

        # Ask Groq only for overview and viva (much smaller response = no truncation)
        raw = groq_chat(
            """You are a code explainer for students. Return ONLY valid JSON, no markdown, no backticks.
Structure: {"language":"X",
"overview":{"purpose":"1-2 sentences what the program does","input":"what user inputs or None","output":"what it prints or returns","concepts":["concept1","concept2"],"difficulty":"Beginner/Intermediate/Advanced","tip":"one learning tip"},
"viva":[{"question":"professor question","hint":"answer hint","difficulty":"Easy/Medium/Hard"}]}
Rules: 6-8 viva questions; mix Easy/Medium/Hard; be specific to this exact code.""",
            f"Analyze this code:\n\n{code}",
            max_tokens=1500
        )
        if raw:
            try:
                parsed = clean_json(raw)
                # Merge: regex lines + Groq overview/viva
                result = {
                    "language": parsed.get("language", regex_result["language"]),
                    "lines": regex_result["lines"],  # always complete from regex
                    "overview": parsed.get("overview", regex_result["overview"]),
                    "viva": parsed.get("viva", regex_result["viva"]),
                    "source": "groq-ai"
                }
                print(f"Groq explained {result['language']} - {lines_count} lines (hybrid mode)")
                return jsonify(result)
            except Exception as e:
                print(f"Groq parse failed: {e} — using full regex")
        return jsonify({**regex_result, "source": "regex-fallback"})

    else:
        # Small file: ask Groq for everything
        raw = groq_chat(
            """You are a code explainer for students. Return ONLY valid JSON, no markdown, no backticks.
Structure: {"language":"X","lines":[{"lineNum":1,"icon":"emoji","text":"under 15 words"}],
"overview":{"purpose":"...","input":"...","output":"...","concepts":["..."],"difficulty":"Beginner/Intermediate/Advanced","tip":"..."},
"viva":[{"question":"...","hint":"...","difficulty":"Easy/Medium/Hard"}]}
Rules: include EVERY meaningful line; skip only blank lines and lone braces; 6-8 viva questions; mix Easy/Medium/Hard.""",
            f"Explain this code:\n\n{code}",
            max_tokens=2000
        )
        if raw:
            try:
                parsed = clean_json(raw)
                print(f"Groq explained {parsed.get('language','?')} - {lines_count} lines")
                return jsonify({**parsed, "source": "groq-ai"})
            except Exception as e:
                print(f"Groq JSON parse failed: {e}")

        print("Using regex fallback")
        return jsonify({**regex_analyze(code), "source": "regex-fallback"})


@app.route('/analyze-errors', methods=['POST','OPTIONS'])
def analyze_errors():
    if request.method == 'OPTIONS': return '', 200
    data = request.get_json()
    code = data.get('code','').strip()
    if not code: return jsonify({"error": "No code"}), 400

    raw = groq_chat(
        """You are a code debugger. Return ONLY valid JSON, no markdown.
Structure: {"errors":[{"line":1,"type":"syntax/logic/style","severity":"error/warning/info","message":"what is wrong","fix":"how to fix it"}],
"score":85,"summary":"overall code quality summary in one sentence"}
If no errors, return {"errors":[],"score":100,"summary":"No issues found. Clean code!"}""",
        f"Find all bugs and issues in this code:\n\n{code}"
    )
    if raw:
        try:
            return jsonify({**clean_json(raw), "source": "groq-ai"})
        except: pass
    return jsonify({"errors":[],"score":75,"summary":"Analysis unavailable — Groq not connected.","source":"fallback"})


@app.route('/complexity', methods=['POST','OPTIONS'])
def complexity_score():
    if request.method == 'OPTIONS': return '', 200
    data = request.get_json()
    code = data.get('code','').strip()
    if not code: return jsonify({"error": "No code"}), 400

    lines = [l for l in code.split('\n') if l.strip()]
    n = len(lines)
    loops = len(re.findall(r'\bfor\b|\bwhile\b', code))
    conditions = len(re.findall(r'\bif\b|\belif\b|\belse\b|\bswitch\b|\bcase\b', code))
    functions = len(re.findall(r'\bdef\b|\bfunction\b|\bvoid\b|\bpublic\b|\bprivate\b', code))
    nesting = max((len(l) - len(l.lstrip())) // 4 for l in lines) if lines else 0
    raw_score = min(100, (loops*8) + (conditions*5) + (functions*6) + (nesting*10) + min(n, 30))
    level = "Beginner" if raw_score < 30 else "Intermediate" if raw_score < 60 else "Advanced"

    raw = groq_chat(
        """You are a code complexity analyzer. Return ONLY valid JSON, no markdown.
Structure: {"score":75,"level":"Beginner/Intermediate/Advanced",
"metrics":{"lines":10,"functions":2,"loops":3,"conditions":4,"nesting_depth":2},
"breakdown":[{"factor":"factor name","value":"description"}],
"recommendation":"one tip to reduce complexity"}""",
        f"Analyze complexity of this code:\n\n{code}"
    )
    if raw:
        try:
            return jsonify({**clean_json(raw), "source": "groq-ai"})
        except: pass

    return jsonify({
        "score": raw_score, "level": level,
        "metrics": {"lines": n, "functions": functions, "loops": loops, "conditions": conditions, "nesting_depth": nesting},
        "breakdown": [
            {"factor": "Lines of code", "value": str(n)},
            {"factor": "Loops", "value": str(loops)},
            {"factor": "Conditions", "value": str(conditions)},
            {"factor": "Functions/Methods", "value": str(functions)},
            {"factor": "Max nesting depth", "value": str(nesting)},
        ],
        "recommendation": "Break large functions into smaller ones to reduce complexity.",
        "source": "local"
    })


@app.route('/dry-run', methods=['POST','OPTIONS'])
def dry_run():
    if request.method == 'OPTIONS': return '', 200
    data = request.get_json()
    code = data.get('code','').strip()
    if not code: return jsonify({"error": "No code"}), 400

    # For large code, only trace the key function — not every line
    lines_count = len([l for l in code.split('\n') if l.strip()])
    if lines_count > 40:
        prompt_code = f"Focus on the main logic only (skip boilerplate). Code:\n\n{code}"
        max_steps = "Show at most 10 key steps — the most important variable changes."
    else:
        prompt_code = f"Code:\n\n{code}"
        max_steps = "Trace all steps."

    raw = groq_chat(
        f"""You are a code execution tracer for students. Return ONLY valid JSON, no markdown, no backticks, no explanation outside the JSON.
Return exactly this structure:
{{"steps":[{{"step":1,"line":1,"action":"plain English description of what happens","variables":{{"var1":"value1"}},"output":"printed output or empty string"}}],
"final_output":"complete program output","summary":"one sentence: what the program computed"}}
{max_steps}
IMPORTANT: Return ONLY the JSON object. Nothing before or after it.""",
        prompt_code,
        max_tokens=1500
    )

    if raw:
        try:
            parsed = clean_json(raw)
            print(f"Dry run: {len(parsed.get('steps', []))} steps traced")
            return jsonify({**parsed, "source": "groq-ai"})
        except Exception as e:
            print(f"Dry run JSON parse failed: {e}")
            print(f"Raw response (first 300 chars): {raw[:300]}")
            # Try to extract JSON from response if it has extra text
            try:
                import json as _json
                start = raw.find('{')
                end = raw.rfind('}') + 1
                if start >= 0 and end > start:
                    parsed = _json.loads(raw[start:end])
                    return jsonify({**parsed, "source": "groq-ai"})
            except: pass

    return jsonify({
        "steps": [
            {"step": 1, "line": 1, "action": "Groq could not trace this code. Try with shorter code.", "variables": {}, "output": ""}
        ],
        "final_output": "Trace unavailable for this code size.",
        "summary": "Dry run works best with code under 40 lines. Try pasting just one function.",
        "source": "fallback"
    })


@app.route('/chat', methods=['POST','OPTIONS'])
def chat_with_code():
    if request.method == 'OPTIONS': return '', 200
    data = request.get_json()
    code = data.get('code','').strip()
    question = data.get('question','').strip()
    history = data.get('history', [])
    if not code or not question: return jsonify({"error": "Missing code or question"}), 400

    messages_payload = [
        {"role":"system","content":f"""You are a helpful coding tutor. The student is asking about this code:

```
{code}
```

Answer clearly and concisely for a beginner student. Keep answers under 100 words."""}
    ]
    for h in history[-6:]:
        messages_payload.append({"role": h["role"], "content": h["content"]})
    messages_payload.append({"role":"user","content": question})

    client = get_groq_client()
    if client:
        try:
            resp = client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=messages_payload,
                temperature=0.5, max_tokens=300
            )
            answer = resp.choices[0].message.content.strip()
            return jsonify({"answer": answer, "source": "groq-ai"})
        except Exception as e:
            print(f"Chat error: {e}")
    return jsonify({"answer": "Chat unavailable — set your Groq key in app.py line 19.", "source": "fallback"})


@app.route('/compare', methods=['POST','OPTIONS'])
def compare_code():
    if request.method == 'OPTIONS': return '', 200
    data = request.get_json()
    code1 = data.get('code1','').strip()
    code2 = data.get('code2','').strip()
    if not code1 or not code2: return jsonify({"error": "Need both code snippets"}), 400

    raw = groq_chat(
        """You are a code comparison expert. Return ONLY valid JSON, no markdown.
Structure: {"differences":[{"aspect":"aspect name","code1":"description","code2":"description"}],
"winner":"code1 or code2 or tie","reason":"why winner is better",
"code1_pros":["pro1","pro2"],"code2_pros":["pro1","pro2"],
"recommendation":"which to use and why in one sentence"}""",
        f"Compare these two code snippets:\n\nCODE 1:\n{code1}\n\nCODE 2:\n{code2}"
    )
    if raw:
        try:
            return jsonify({**clean_json(raw), "source": "groq-ai"})
        except: pass
    return jsonify({"differences":[],"winner":"tie","reason":"Comparison unavailable","recommendation":"Set your Groq key in app.py.","source":"fallback"})


@app.route('/flashcards', methods=['POST','OPTIONS'])
def generate_flashcards():
    if request.method == 'OPTIONS': return '', 200
    data = request.get_json()
    viva = data.get('viva', [])
    if not viva: return jsonify({"error": "No viva questions"}), 400
    cards = [{"id": i, "front": q["question"], "back": q["hint"], "difficulty": q.get("difficulty","Medium")} for i,q in enumerate(viva)]
    return jsonify({"cards": cards, "total": len(cards)})


@app.route('/health', methods=['GET'])
def health():
    key_ready = GROQ_KEY != "PASTE_YOUR_NEW_GROQ_KEY_HERE" and len(GROQ_KEY) > 10
    return jsonify({"status":"healthy","groq_installed":GROQ_AVAILABLE,"key_ready":key_ready})

@app.route('/', methods=['GET'])
def home():
    return jsonify({"app":"FocusSense AI","version":"6.0","status":"running"})

if __name__ == '__main__':
    print("=" * 60)
    print("FOCUSSENSE AI v6.0 - Full Feature Build")
    print("=" * 60)
    print("Server: http://127.0.0.1:5000")
    print("Routes:")
    print("  POST /explain-ai     - Full 3-column analysis")
    print("  POST /analyze-errors - Bug detector")
    print("  POST /complexity     - Complexity score")
    print("  POST /dry-run        - Step-by-step trace")
    print("  POST /chat           - Chat with your code")
    print("  POST /compare        - Compare 2 snippets")
    print("  POST /flashcards     - Generate flashcards")
    key_ready = GROQ_KEY != "PASTE_YOUR_NEW_GROQ_KEY_HERE" and len(GROQ_KEY) > 10
    if GROQ_AVAILABLE and key_ready:
        print("Groq: READY")
    elif GROQ_AVAILABLE:
        print("Groq: KEY MISSING - open app.py and paste your key on line 19")
        print("      Get free key at: https://console.groq.com")
    else:
        print("Groq: run pip install groq")
    print("=" * 60)
    app.run(debug=True, host='127.0.0.1', port=5000)
