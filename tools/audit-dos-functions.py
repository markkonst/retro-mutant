#!/usr/bin/env python3
"""Reproducible static function census; requires capstone, local images and research.

Counts addresses, not semantic algorithms. Unresolved indirect flow prevents a
proof of completeness. Never scan arbitrary resource bytes for RET/prologues.
"""
import argparse, collections, hashlib, json, re
from pathlib import Path
from capstone import Cs, CS_ARCH_X86, CS_MODE_16, CS_GRP_CALL, CS_GRP_JUMP, CS_GRP_RET, CS_GRP_IRET
from capstone.x86 import X86_OP_IMM

SEGMENTS = [0, 0x96d, 0xc8c, 0xf6b, 0x1239, 0x1556]
FALSE = {0x4408,0x5150,0x7f90,0xc22a,0xcad6}

def audit(images, research, catalogue, levels):
    texts = catalogue.read_text(encoding="utf-8")
    blobs = {}
    for p in sorted(images.iterdir()):
        if p.name.endswith('.image.bin') or p.suffix.upper()=='.OVL':
            blobs[p.name.split('.')[0].upper()] = p.read_bytes()
    entries, internal = {}, set()
    section = ''
    for line in texts.splitlines():
        if line.startswith('## '): section=line[3:]
        match=re.match(r'\| `([A-Z0-9]+):([0-9A-F]{4})` \|',line)
        if not match: continue
        owner,offset=match[1],int(match[2],16)
        if owner in ['0000','096D']:
            image,base='SIMPSONS',int(owner,16)*16
        else: image,base=owner,0
        key=(image,base,offset)
        if section.startswith('Internal'): internal.add(key);continue
        if not (section.startswith('Root executable') or section.startswith('Display overlays') or section.startswith('Sound backends') or section.startswith('Resident graphics')): continue
        names=re.findall(r'`([^`]+)`',line)
        name=names[2] if image=='SIMPSONS' else names[1]
        entries[key]={'name':name,'evidence':['catalogue'],'catalogued':True}
    catalogued=set(entries)
    evidence=[]
    def add(key, why, name=None):
        image,base,off=key
        if key in internal or (image=='SIMPSONS' and base+off in FALSE):return
        if image not in blobs or not 0<=base+off<len(blobs[image]):return
        record=entries.setdefault(key,{'name':name or 'candidate','evidence':[],'catalogued':False})
        if why not in record['evidence']:record['evidence'].append(why)
    # All 64 API slots, with aliases collapsed by target offset.
    api=[]
    for image in ['VGA','EGA','CGA','TGA']:
        b=blobs[image]
        for slot in range(64):
            off=int.from_bytes(b[slot*4:slot*4+2],'little');seg=int.from_bytes(b[slot*4+2:slot*4+4],'little')
            api.append({'image':image,'slot':slot*4,'offset':off,'segmentWord':seg})
            if seg==0 and off>=256:add((image,0,off),f'API slot {slot*4:02X}')
    # Sound files expose near-call/far-return entry stubs at 0 and 4.
    for image in ['ADLIB','BUZZER','ROLAND']:
        for off in [0,4]:add((image,0,off),'public sound entry stub')
    # Native FAR operands are typed by the script decoder, unlike arbitrary words.
    for n in range(1,6):
        data=json.loads((levels/f'level{n}'/'object_scripts.json').read_text())
        for flow in data['object_types']:
            for i in flow['instructions']:
                if i['name']!='CallNativeFar':continue
                a=i['args'];seg=a['target_segment'];off=a['target_offset']
                if seg in SEGMENTS:add(('SIMPSONS',seg*16,off),f'level {n} script {i["pc_hex"]}',a.get('name'))
    detected=[]
    for p in research.rglob('functions_v10_detected.tsv'):
        for line in p.read_text(encoding='utf-8-sig').splitlines():
            address,name=line.split('\t',1);flat=int(address,16)
            classification='catalogued' if any(k[0]=='SIMPSONS' and k[1]+k[2]==flat for k in catalogued) else 'unreconciled'
            if flat in FALSE:classification='quarantined false detection'
            elif any(k[0]=='SIMPSONS' and k[1]+k[2]==flat for k in internal):classification='internal label'
            detected.append({'flatOffset':flat,'name':name,'classification':classification})
    md=Cs(CS_ARCH_X86,CS_MODE_16);md.detail=True
    seen=set();pending=sorted(entries)+sorted(internal);indirect={};failures=[];calls=[];decoded={}
    # Root DS begins at 080F:0000. Embedded blocks have separate CS bases.
    def allowed(image,base,p):
        if p<0 or p>65535 or base+p>=len(blobs[image]):return False
        if image=='SIMPSONS' and base==0:return p<0x7ce5
        return True
    while pending:
        image,base,p=pending.pop()
        if (image,base,p) in seen:continue
        seen.add((image,base,p))
        if not allowed(image,base,p):continue
        b=blobs[image];instructions=list(md.disasm(b[base+p:base+p+15],p,count=1))
        if not instructions:
            failures.append({'image':image,'base':base,'offset':p,'reason':'undecodable'});continue
        i=instructions[0];decoded[(image,base,p)]=i.size
        after=p+i.size
        branch=i.group(CS_GRP_JUMP);call=i.group(CS_GRP_CALL)
        if call or branch:
            immediate=len(i.operands)==1 and i.operands[0].type==X86_OP_IMM
            if immediate:
                target=i.operands[0].imm&65535;key=(image,base,target)
                if allowed(image,base,target):
                    pending.append(key)
                    if call:
                        calls.append({'image':image,'base':base,'from':p,'to':target})
                        add(key,f'direct call {p:04X}')
            else:
                # FAR immediates may still need relocation; never guess CS/DS.
                indirect[(image,base,p)]={'image':image,'base':base,'offset':p,'instruction':i.mnemonic+' '+i.op_str,'kind':'call' if call else 'jump'}
            if branch and i.mnemonic in ['jmp','ljmp']:continue
        if i.group(CS_GRP_RET) or i.group(CS_GRP_IRET) or i.mnemonic in ['hlt','ud2']:continue
        # DOS process/TSR termination must not fall through into following data.
        if i.mnemonic=='int' and i.op_str in ['0x20','0x27']:continue
        pending.append((image,base,after))
    transfers=list(indirect.values())
    for transfer in transfers:
        transfer['resolution']='unresolved'
        match=re.fullmatch(r'lcall cs:\[0x([0-9a-f]+)\]',transfer['instruction'])
        if transfer['image']=='SIMPSONS' and transfer['base']==0 and match:
            pointer=int(match[1],16);slot=pointer-0x7ce5
            if 0<=slot<256 and slot%4==0:
                transfer['resolution']='display API alternatives identified'
                transfer['targets']=[a for a in api if a['slot']==slot]
    rows=[]
    for key,r in sorted(entries.items()):
        image,base,off=key
        overlaps=[p for (im,ba,p),size in decoded.items() if im==image and ba==base and p<off<p+size]
        rows.append({'image':image,'segment':f'{base//16:04X}','offset':f'{off:04X}','flatOffset':base+off,**r,
                     'status':'catalogued' if r['catalogued'] else 'candidate_requires_review',
                     'instructionBoundaryConflict':bool(overlaps)})
    counts=[]
    for image,b in blobs.items():
        rows_i=[r for r in rows if r['image']==image]
        counts.append({'image':image,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest(),
            'catalogued':sum(r['catalogued'] for r in rows_i),'additionalCandidates':sum(not r['catalogued'] for r in rows_i),
            'unresolvedControlTransfers':sum(t['image']==image and t['resolution']=='unresolved' for t in transfers),
            'mappedDisplayApiCalls':sum(t['image']==image and t['resolution']!='unresolved' for t in transfers)})
    return {'method':'static-census-v1','complete':False,
      'limitations':['Catalogue entries are inherited research, not all independently proven functions.',
        'Candidates reached by API pointers, decoded callbacks or direct CALL need boundary/code-data review.',
        'Indirect calls/jumps and relocated FAR calls are recorded, not assumed resolved.',
        'Tail jumps are traversed but do not create independent functions.',
        'Unreachable/interrupt-only/self-modified code can remain undiscovered; no total-function denominator is certified.',
        'Each overlay is counted separately; repeated algorithms are not semantically deduplicated.'],
      'images':counts,'entries':rows,'apiSlots':api,'directCalls':calls,
      'controlTransfers':transfers,'decodeFailures':failures,'ghidraDetected':detected,
      'internalLabelsExcluded':len(internal),'quarantinedFlatOffsets':[f'{x:04X}' for x in sorted(FALSE)]}

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--images',type=Path,required=True);parser.add_argument('--research',type=Path,required=True)
    parser.add_argument('--catalogue',type=Path,default=Path('docs/DOS_FUNCTION_CATALOG.md'))
    parser.add_argument('--levels',type=Path,default=Path('wwwroot/data'))
    parser.add_argument('--output',type=Path,default=Path('obj/dos-function-audit.json'))
    args=parser.parse_args();result=audit(args.images,args.research,args.catalogue,args.levels)
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
    for row in result['images']:print(row['image'],row['catalogued'],row['additionalCandidates'],row['unresolvedControlTransfers'])
    print('Ghidra reconciliation:',dict(collections.Counter(x['classification'] for x in result['ghidraDetected'])))
    print('Incomplete static census saved to',args.output)
