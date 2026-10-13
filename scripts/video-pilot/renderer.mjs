import { scenes, cues, duration } from './scene-data.mjs';

const svg = document.querySelector('#frame');
const ink = '#274c3b';
const colors = ['#849dd6', '#f2b195', '#a7b588'];
const names = ['지우', '서윤', '민호'];
const roles = ['코드 만들기', '그림 그리기', '테스트·홍보'];
const clamp = x => Math.max(0, Math.min(1, x));
const ease = x => 1 - Math.pow(1 - clamp(x), 3);
const escape = s => s.replace(/[&<>"']/g, x => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const text = (x,y,value,size=30,weight=600,anchor='start',extra='') => `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" ${extra}>${escape(value)}</text>`;
const round = (x,y,w,h,fill='#fffdf4',r=24,extra='') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${ink}" stroke-width="2" ${extra}/>`;

function star(x,y,size=17,angle=0) {
  return `<path transform="translate(${x} ${y}) rotate(${angle}) scale(${size/20})" d="M0 -20L5 -5L20 0L5 5L0 20L-5 5L-20 0L-5 -5Z" fill="#f3d568" stroke="${ink}" stroke-width="1.5"/>`;
}

function character(index,x,y,scale,t,talking=false) {
  // Same colors, silhouettes and hair clip as the website's original vector art.
  const skin = ['#efd2b4','#eed0b0','#dfb792'][index];
  const hair = ['#303d36','#584936','#303d36'][index];
  const bounce = Math.sin(t*2+index)*3;
  const blink = t%4.7 > 4.5;
  const mouth = talking ? 4+Math.abs(Math.sin(t*8))*6 : 0;
  const hairPath = index===0 ? 'M-42 -67Q-48 -121 0 -111Q48 -119 42 -67L17 -92L-8 -78L-26 -86Z'
    : index===1 ? 'M-43 -65Q-49 -123 0 -111Q50 -117 44 -64L17 -100L-22 -81Z'
    : 'M-42 -76Q-48 -121 0 -111Q45 -119 42 -73L6 -96Z';
  return `<g transform="translate(${x} ${y+bounce}) scale(${scale})" stroke="${ink}" stroke-width="2.7" stroke-linejoin="round">
    <ellipse cx="0" cy="80" rx="67" ry="8" fill="#274c3b" opacity=".1" stroke="none"/>
    <path d="M-60 71V17C-60 -39 60 -39 60 17V71Z" fill="${colors[index]}"/>
    <path d="M-43 18L-47 52M43 18L47 52" fill="none" opacity=".65"/>
    <circle cy="-67" r="43" fill="${skin}"/>
    <path d="${hairPath}" fill="${hair}"/>
    ${index===1 ? '<path d="M-30 -94L-44 -109M-33 -101L-45 -99" stroke="#9f6289" stroke-width="5" stroke-linecap="round"/>' : ''}
    <path d="M-15 -65${blink?'h7':'v5'}M14 -65${blink?'h7':'v5'}" fill="none" stroke-linecap="round"/>
    ${talking?`<ellipse cx="2" cy="-43" rx="7" ry="${mouth}" fill="#584936"/>`:'<path d="M-7 -44Q1 -37 9 -44" fill="none" stroke-linecap="round"/>'}
    <circle cx="-27" cy="-48" r="5" fill="#d09b83" opacity=".35" stroke="none"/>
    <circle cx="29" cy="-48" r="5" fill="#d09b83" opacity=".35" stroke="none"/>
  </g>`;
}

function rabbit(x,y,scale,t=0) {
  return `<g transform="translate(${x} ${y}) scale(${scale})" fill="#fffdf4" stroke="${ink}" stroke-width="3">
    <ellipse cx="-12" cy="-35" rx="8" ry="24" transform="rotate(-12 -12 -35)"/>
    <ellipse cx="12" cy="-35" rx="8" ry="24" transform="rotate(12 12 -35)"/>
    <ellipse cy="5" rx="32" ry="28"/><circle cx="-12" cy="1" r="2" fill="${ink}"/>
    <circle cx="12" cy="1" r="2" fill="${ink}"/><path d="M-4 13Q0 18 4 13" fill="none"/>
    <ellipse cx="-16" cy="30" rx="12" ry="6"/><ellipse cx="16" cy="30" rx="12" ry="6"/>
  </g>`;
}

function laptop(x,y,scale,t,mode='game') {
  const jump = -Math.abs(Math.sin(t*2))*55;
  return `<g transform="translate(${x} ${y}) scale(${scale})">
    ${round(-190,-130,380,245,mode==='code'?'#274c3b':'#d6e4cf',18)}
    <path d="M-218 117H218L202 137H-202Z" fill="#c8cfbe" stroke="${ink}" stroke-width="3"/>
    ${mode==='code' ? `${text(-155,-68,'if (jump) {',25,700,'start','style="fill:#f3d568"')}${text(-130,-24,'rabbit.goUp();',25,600,'start','style="fill:#fffdf4"')}${text(-155,20,'}',25,700,'start','style="fill:#f3d568"')}${round(-152,54,65,12,'#849dd6',5)}${round(-75,54,104,12,'#a7b588',5)}`
      : `${text(0,-85,'달토끼 점프',25,800,'middle')}<path d="M-160 77H160" stroke="${ink}" stroke-width="3"/>${rabbit(0,35+jump,.78,t)}${star(115,-18,12,t*10)}${star(-110,-20,10)}`}
  </g>`;
}

function envelope(x,y,scale,t) {
  return `<g transform="translate(${x} ${y}) rotate(${Math.sin(t*1.5)*2}) scale(${scale})">
    ${round(-230,-112,460,242,'#fffdf4',18)}
    <path d="M-230 -92L0 52L230 -92M-230 130L-80 6M230 130L80 6" fill="none" stroke="${ink}" stroke-width="3"/>
    ${round(-135,-145,270,193,'#f3d568',12)}
    ${text(0,-106,'학교 축제 · 게임 상금',19,700,'middle')}
    ${text(0,-44,'100,000',55,900,'middle')}${text(0,-9,'원',25,700,'middle')}
  </g>`;
}

function speech(x,y,w,lines,index) {
  const h = 48+lines.length*48;
  return `${round(x,y,w,h,'#fffdf4',26)}<path d="M${x+28} ${y+h}L${x+5} ${y+h+26}L${x+68} ${y+h}" fill="#fffdf4" stroke="${ink}" stroke-width="2"/>${lines.map((line,i)=>text(x+32,y+53+i*48,line,32,700)).join('')}`;
}

function castRow(t,y=440,scale=1.3,labels=true) {
  return [0,1,2].map(i=>`${character(i,340+i*300,y,scale,t)}${labels?text(340+i*300,y+126,names[i],26,800,'middle'):''}`).join('');
}

function activeScene(index,t,l) {
  const enter = ease(l/1.2);
  let body = '';
  if(index===0) {
    body = `${text(640,173,'우리 게임이',32,600,'middle')}${text(640,237,'상금 10만 원을 탔다!',52,900,'middle')}
      <g opacity="${enter}" transform="translate(0 ${35*(1-enter)})">${envelope(640,418,.94,t)}</g>
      ${star(310,390,22,t*8)}${star(955,425,29,-t*10)}${star(970,284,12,t*4)}
      ${l>6?`<g opacity="${ease((l-6)/.8)}">${round(824,492,276,73,'#e2dcf0',26)}${text(962,539,'누구 돈일까?',30,800,'middle')}</g>`:''}`;
  } else if(index===1) {
    body = `${text(640,165,'세 친구가 함께 만든',37,800,'middle')}${text(640,206,'달토끼 점프',25,600,'middle')}
      ${laptop(640,340,.84,t)}
      ${[0,1,2].map(i=>`${character(i,340+i*300,517,.65,t)}${text(340+i*300,607,names[i],24,800,'middle')}`).join('')}
      ${round(118,265,263,51,'#f3d568',25)}${text(249,299,'학교 축제 · 수상!',21,800,'middle')}`;
  } else if(index>=2 && index<=4) {
    const i=index-2;
    const dialogue = [ ['내가 코드를 만들었어.','게임이 움직이게 한 건 나야!'],
      ['캐릭터와 배경은 내가 그렸어.','사람들이 좋아한 건 그림이야!'],
      ['친구들에게 게임을 소개하고','해 보게 한 건 나야!'] ][i];
    body = `${round(87,147,335,425,['#dfe6f4','#f6e0d2','#e1e8d7'][i],32)}
      ${character(i,254,355,1.65,t,l>4)}${text(254,513,names[i],38,900,'middle')}${text(254,551,roles[i],23,600,'middle')}
      <g transform="translate(${30*(1-enter)} 0)" opacity="${enter}">${speech(478,158,709,dialogue,i)}</g>`;
    if(i===0) body+=laptop(785,451,.76,t,'code');
    if(i===1) body+=`${round(602,357,332,211,'#e2dcf0',18)}${rabbit(727,469,1.2,t)}${star(866,394,18,t*5)}
      <g transform="translate(981 476) rotate(${Math.sin(t)*8})"><path d="M0 50L41 -59L66 -49L25 60Z" fill="#f3d568" stroke="${ink}" stroke-width="3"/><path d="M0 50L-1 77L25 60Z" fill="#efd2b4" stroke="${ink}" stroke-width="3"/></g>`;
    if(i===2) body+=`${round(572,369,310,180,'#d6e4cf',20)}${text(727,414,'테스트 · 홍보',23,700,'middle')}
      <path d="M611 452L622 464L647 434M611 500L622 512L647 482" fill="none" stroke="${ink}" stroke-width="5" stroke-linecap="round"/>
      ${text(673,462,'직접 해 보기',23,600)}${text(673,510,'친구에게 알리기',23,600)}
      <g transform="translate(1024 464) rotate(${Math.sin(t*1.5)*5})"><path d="M-76 -23L12 -63L12 49L-76 11Z" fill="#f3d568" stroke="${ink}" stroke-width="3"/><path d="M-66 13L-52 65H-25L-38 1" fill="#a7b588" stroke="${ink}" stroke-width="3"/><path d="M38 -43L62 -55M44 -8H74M38 29L62 42" stroke="${ink}" stroke-width="4" stroke-linecap="round"/></g>`;
  } else if(index===5) {
    body = `${text(640,167,'잠깐, 우리 약속했었나?',45,900,'middle')}${round(383,224,515,165,'#fffdf4',22)}
      ${text(640,270,'상금 나누는 방법',29,800,'middle')}${text(640,331,'미리 정한 약속이 없어',30,600,'middle')}
      ${castRow(t,484,1.0,false)}${[0,1,2].map(i=>text(340+i*300,594,names[i],24,800,'middle')).join('')}
      ${star(232,305,18,t*6)}${star(1032,331,20,-t*5)}`;
  } else if(index===6) {
    body = `${text(640,159,'10만 원을 열 개의 칩으로',40,900,'middle')}${text(640,208,'칩 하나 = 1만 원',26,600,'middle')}`;
    for(let i=0;i<10;i++) {
      const a=ease((l-i*.13)/.65);
      const x=208+i*96;
      body+=`<g opacity="${a}" transform="translate(${x} ${304-25*(1-a)+Math.sin(t*2+i)*3}) scale(${.7+.3*a})"><circle r="34" fill="#f3d568" stroke="${ink}" stroke-width="2.5"/><circle r="26" fill="none" stroke="${ink}" stroke-width="1"/>${text(0,11,'1',31,800,'middle')}</g>`;
    }
    body+=[0,1,2].map(i=>`${round(204+i*300,389,272,178,'#fffdf4',22)}${character(i,257+i*300,482,.55,t)}${text(347+i*300,455,names[i],26,800,'middle')}${text(347+i*300,518,'아직 빈 그릇',21,500,'middle')}`).join('');
  } else {
    body = `${text(640,166,'네가 네 번째 친구라면?',46,900,'middle')}${castRow(t,384,1.2,false)}
      ${round(314,507,652,81,'#f3d568',28)}${text(640,559,'너의 제안과 이유를 들려줘',32,800,'middle')}
      ${[0,1,2].map(i=>text(340+i*300,493,names[i],24,800,'middle')).join('')}
      <g transform="translate(1120 273)">${round(-76,-65,150,129,'#e2dcf0',35)}${text(0,26,'?',77,800,'middle')}</g>`;
  }
  return body;
}

window.renderFrame = function(time) {
  const t = Math.max(0,Math.min(duration-1/24,time));
  const index = scenes.findIndex(s=>t>=s.start&&t<s.end);
  const scene=scenes[index];
  const caption = cues.find(c=>t>=c[0]&&t<c[1]);
  svg.innerHTML = `<defs><pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#274c3b" stroke-opacity=".045"/></pattern></defs>
    <rect width="1280" height="720" fill="#f8f5e9"/><rect width="1280" height="720" fill="url(#grid)"/>
    <path d="M62 88H1218" stroke="${ink}" stroke-width="1.5" stroke-opacity=".22"/>
    ${round(61,29,43,43,'#f3d568',15)}${text(82,61,'?',31,800,'middle')}
    ${text(118,62,'물음표 클럽',25,800)}${text(333,61,'공정함과 책임 · 사건 01',18,500)}
    ${text(1216,61,'90초 모션 웹툰 · 파일럿',18,500,'end')}
    ${activeScene(index,t,t-scene.start)}
    ${round(61,620,1158,64,'#274c3b',18)}${text(640,663,caption?.[2]??'',29,600,'middle','style="fill:#fffdf4;letter-spacing:-.5px"')}
    <rect x="62" y="707" width="1156" height="4" rx="2" fill="#d6dfd1"/>
    <rect x="62" y="707" width="${1156*t/duration}" height="4" rx="2" fill="#64875b"/>
    ${scenes.map((s,i)=>`<circle cx="${1115+i*13}" cy="99" r="3" fill="${i===index?'#274c3b':'#ced7c6'}"/>`).join('')}`;
  return {scene:index,caption:caption?.[2]??''};
};
window.renderFrame(0);
window.rendererReady = true;
