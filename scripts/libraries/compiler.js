/**
 * GScript was mostly created to be a very simple way to write continuation-
 * based scripts. All c
 */

var fs = require('fs');

function split(f) {
    return f.replace(/\r\n/g, '\n').split('\n');
}

function until(str, terminal) {
    return str.substring(0, str.indexOf(terminal));
}

function clean(l) {
    return l.map( (e) => {
        if (e.indexOf('//') >= 0) {
            return until(e, '//');
        }
        return e;
    }).map( e => e.trim() ).filter( e => e.length != 0);
}

function lex(l) {
    let root = "root";
    let instructions = [];

    let name = "root";
    let id = 1;
    
    while (l.length > 0) {
        let i = l.shift();
        // label
        if (i.endsWith(':')) {
            name = until(i, ':');
            id = 1;
            continue;
        }

        let instruction = {
            key: id == 1 ? name : name + "-" + id
        }
        id++;

        let space = i.indexOf(' ') > 0 ? i.indexOf(' ') : i.length;
        instruction.command = i.substring(0, space);
        instruction.args = i.substring(space + 1);

        // multiline
        if (i.startsWith('switch') ||
            i.startsWith('userchoice') || 
            i.startsWith('hasitem') ||
            i.startsWith('megaswitch')) {
            let ml = [];
            while (true) {
                i = l.shift();
                if (i != 'end') 
                    ml.push(i);
                else
                    break;
            }
            instruction.children = ml;
        }
        instructions.push(instruction);
    }
    return { root: "root", instructions: instructions };
}

function desugar(l) {
    let desugared = [];
    for (let i in l.instructions) {
        let ii = l.instructions[i];

        if (ii.command == 'megaswitch') {
            let base = ii.key;
            for (let j in ii.children) {
                let s = ii.children[j].split('->');
                let condition = s[0].trim();
                let label = s[1].trim();
                
                let cParsed = condition.split(' ');
                let cCommand = cParsed[0].trim();
                if (cCommand == 'var') {
                    let v = cParsed[1].trim();
                    let vv = cParsed[2].trim();
                    desugared.push({
                        key: base + ((j == 0) ? "" : j),
                        command: "switch",
                        args: v,
                        children: [
                            vv + "->" + label,
                            "false" + "->" + base + (Number(j) + 1)
                        ]
                    })
                } else if (cCommand == 'hasitem') {
                    let v = cParsed[1].trim();
                    desugared.push({
                        key: base + ((j == 0) ? "" : j),
                        command: "hasitem",
                        args: v,
                        children: [
                            "true" + "->" + label,
                            "false" + "->" + base + (Number(j) + 1)
                        ]
                    })
                } else if (cCommand == 'default') {
                    desugared.push({
                        key: base + j,
                        command: "noop",
                        args: label
                    });
                }
            }
        } else {
            desugared.push(ii);
        }
    }
    return { root: l.root, instructions: desugared };
}

function convert(i) {
    let program = { root: i.root }

    let conversation = {};
    
    for (let j in i.instructions) {
        let ii = i.instructions[j];

        let compiled = {
            
        }

        let key = ii.key;
        
        let n = i.instructions[Number(j) + 1];
        if (!n || n.command == 'end') {
            compiled.next = false;
        } else if (n.command == 'goto') {
            compiled.next = n.args.trim();
        } else if (n.key) {
            compiled.next = n.key;
        } else {
            console.log("Next instruction is unknown " + JSON.stringify(n));
        }

        switch (ii.command) {
            case 'end': 
                continue;
            case 'goto':
                continue;
            case 'noop':
                compiled.type = 'noop';
                break;
            case 'npcmessage':
                compiled.type = 'message'
                compiled.speaker = '$npc'
                compiled.message = ii.args
                break;
            case 'playermessage': 
                compiled.type = 'message'
                compiled.speaker = '$player'
                compiled.message = ii.args
                break;
            case 'narration':
                compiled.type = 'message'
                compiled.speaker = ''
                compiled.message = ii.args
                break;
            case 'switch':
                compiled.type = 'switch'
                compiled.var = ii.args.trim();
                for (let m in ii.children) {
                    let mm = ii.children[m];
                    let s = mm.split('->');
                    let message = s[0].trim();
                    let label = s[1].trim();
                    compiled[message] = label;
                }
                break;
            case 'hasitem':
                compiled.type = 'hasitem'
                compiled.item = ii.args.trim();
                for (let m in ii.children) {
                    let mm = ii.children[m];
                    let s = mm.split('->');
                    let message = s[0].trim();
                    let label = s[1].trim();
                    compiled[message] = label;
                }
                break;
            case 'userchoice':
                compiled.type = 'choice'
                compiled.message = ii.args.trim();
                compiled.options = {};
                for (let m in ii.children) {
                    let mm = ii.children[m];
                    let s = mm.split('->');
                    let message = s[0].trim();
                    let label = s[1].trim();
                    compiled.options[label] = message;
                }
                break;
            case 'setvar':
                compiled.type = 'setvar';
                let s = ii.args.split(' ');
                compiled.var = s[0].trim();
                compiled.value = s[1].trim();
                break;
            case 'giveitem':
                compiled.type = 'giveitem';
                let i = ii.args.split(' ');
                compiled.item = i[0].trim();
                if (i[1]) 
                    compiled.quantity = i[1].trim();
                break;
            case 'takeitem':
                compiled.type = 'takeitem';
                let j = ii.args.split(' ');
                compiled.item = j[0].trim();
                if (j[1]) 
                    compiled.quantity = j[1].trim();

                compiled.success = compiled.next;
                compiled.failure = false;
                break;
            default:
                console.log("Unknown command: " + ii.command);
        }

        conversation[key] = compiled;
    }
    program.conversation = conversation;

    return program;
}

function compile(string) {
    var file = fs.readFileSync("game-scripts/" + string + ".gs").toString();
    let f = split(file);
    let c = clean(f);
    let l = lex(c);
    let r = desugar(l)
    let x = convert(r);
    fs.writeFileSync('output/' + string + ".json", JSON.stringify(x, null, 2));
}

compile(process.argv[2])