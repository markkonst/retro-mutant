"""Execute the original ADLIB service in isolated emulated memory (pip install unicorn).
Only OPL writes are intercepted; no DOS files, host ports or original code run natively.
The generated trace is local research data and must stay outside version control.
"""
import argparse,json,struct
from pathlib import Path
from unicorn import Uc,UC_ARCH_X86,UC_MODE_16,UC_HOOK_CODE
from unicorn.x86_const import UC_X86_REG_AX,UC_X86_REG_SP,UC_X86_REG_IP
p=argparse.ArgumentParser();p.add_argument('driver');p.add_argument('output');p.add_argument('--ticks',type=int,default=10000);a=p.parse_args()
u=Uc(UC_ARCH_X86,UC_MODE_16);u.mem_map(0,0x20000);u.mem_write(0,Path(a.driver).read_bytes());writes=[]
def hook(uc,address,size,data):
 if address==0x4d5:
  ax=uc.reg_read(UC_X86_REG_AX);writes.append([ax&255,ax>>8])
  sp=uc.reg_read(UC_X86_REG_SP);ret=struct.unpack('<H',uc.mem_read(sp,2))[0]
  uc.reg_write(UC_X86_REG_SP,sp+2);uc.reg_write(UC_X86_REG_AX,ax&0xff00);uc.reg_write(UC_X86_REG_IP,ret)
u.hook_add(UC_HOOK_CODE,hook)
trace=[]
for tick in range(a.ticks):
 music=1 if tick in (0,7000) else 255 if tick==6000 else None
 sound=(tick//31)%18+1 if tick%31==0 else None
 if music is not None:u.mem_write(8,struct.pack('<H',music))
 if sound is not None:u.mem_write(10,bytes([sound]))
 writes=[];u.reg_write(UC_X86_REG_AX,0);u.reg_write(UC_X86_REG_SP,0xf000);u.mem_write(0xf000,struct.pack('<H',0xff00))
 u.emu_start(0x3d,0xff00,count=200000)
 if u.reg_read(UC_X86_REG_IP)!=0xff00:raise RuntimeError('Driver did not return')
 trace.append(dict(music=music,sound=sound,writes=writes,voices=list(u.mem_read(0x512,180)),clock=u.mem_read(12,1)[0]))
Path(a.output).parent.mkdir(parents=True,exist_ok=True);Path(a.output).write_text(json.dumps(trace,separators=(',',':')))
print(f'Wrote {len(trace)} original x86 service ticks')
