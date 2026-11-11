import { Suspense, lazy, memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { loveConfig } from './config/loveConfig';
const FireHeart=memo(lazy(()=>import('./components/FireHeart')));
const SPARKS=Array.from({length:18},(_,i)=>({left:`${(i*37+9)%100}%`,top:`${(i*61+13)%100}%`,delay:`${(i%7)*.23}s`,duration:`${2.1+(i%4)*.5}s`}));
function ParticleLetter({char}:{char:string}){
 const ref=useRef<HTMLSpanElement>(null);
 useLayoutEffect(()=>{if(!char.trim()||!ref.current)return;const rect=ref.current.getBoundingClientRect();window.dispatchEvent(new CustomEvent('heart:write',{detail:{x:rect.right,y:rect.top+rect.height*.55}}));},[]);
 return <span ref={ref} className={char.trim()?'writing-char':'writing-space'}>{char}</span>;
}
export default function App(){
 const reduced=!!useReducedMotion();
 const [ready,setReady]=useState(false),[introDone,setIntroDone]=useState(false),[taps,setTaps]=useState(0),[opened,setOpened]=useState(false),[letters,setLetters]=useState(0),[paragraph,setParagraph]=useState(0);
 const onReady=useCallback(()=>setReady(true),[]);
 const paragraphs=loveConfig.personalMessage.split(/\n\s*\n/);
 const message=Array.from(paragraphs[paragraph]);
 const messageRef=useRef<HTMLParagraphElement>(null);
 useEffect(()=>{if(!ready)return;const timer=window.setTimeout(()=>setIntroDone(true),4000);return()=>window.clearTimeout(timer)},[ready]);
 useLayoutEffect(()=>{if(!opened)return;setLetters(0);let i=0;const timer=window.setInterval(()=>{i++;setLetters(current=>Math.max(current,i));if(i>=message.length)window.clearInterval(timer)},loveConfig.animationSettings.typewriterSpeed);return()=>window.clearInterval(timer)},[opened,paragraph]);
 useEffect(()=>{if(messageRef.current)messageRef.current.scrollTop=messageRef.current.scrollHeight},[letters,paragraph]);
 const emitTouch=(x?:number,y?:number)=>window.dispatchEvent(new CustomEvent('heart:touch',{detail:{x,y}}));
 const reactToTouch=(e?:React.MouseEvent<HTMLElement>)=>{if(!ready||!introDone)return;emitTouch(e?.clientX,e?.clientY);if(opened)setParagraph(n=>Math.min(n+1,paragraphs.length-1));else setTaps(n=>Math.min(n+1,5));};
 const openMessage=(e:React.MouseEvent<HTMLButtonElement>)=>{e.stopPropagation();emitTouch(e.clientX,e.clientY);setOpened(true);};
 return <main className="heart-stage" tabIndex={0} aria-label="A glowing heart. Tap five times to uncover a message, then tap anywhere to continue." onClick={reactToTouch} onKeyDown={e=>{if(e.target===e.currentTarget&&(e.key==='Enter'||e.key===' ')){e.preventDefault();reactToTouch();}}}>
  <Suspense fallback={null}><FireHeart burst={false} hover={false} reduced={reduced} onReady={onReady}/></Suspense>
  <AnimatePresence>{ready&&<motion.section className="heart-center" initial={{opacity:0,scale:.92}} animate={{opacity:1,scale:1}} exit={{opacity:0}} transition={{duration:reduced?0:1}} aria-label="A message for you">
   <div className="center-sparks" aria-hidden="true">{SPARKS.map((spark,i)=><i key={i} style={{left:spark.left,top:spark.top,animationDelay:spark.delay,animationDuration:spark.duration}}/>)}</div>
   <AnimatePresence mode="wait">{!introDone?<motion.div key="greeting" className="center-content" initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-6}} transition={{duration:reduced?0:.8}}><p className="heart-greeting">Hello my love,<br/><em>a small message awaits for you.</em></p></motion.div>:opened?<motion.div key="message" className="message-content" initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{duration:reduced?0:.8}}><p ref={messageRef} className="heart-message long-message" aria-label={paragraphs[paragraph]}><span aria-hidden="true">{message.slice(0,letters).map((char,i)=><ParticleLetter char={char} key={`${paragraph}-${i}`}/>)}<span className={letters>=message.length?'typing-cursor done':'typing-cursor'} /></span></p>{loveConfig.senderName&&paragraph===paragraphs.length-1&&letters>=message.length&&<span className="message-signature">{loveConfig.senderName}</span>}</motion.div>:taps>=5?<motion.div key="reveal" className="center-content" initial={{opacity:0,scale:.9}} animate={{opacity:1,scale:1}} exit={{opacity:0}}><button className="heart-action reveal-action" onClick={openMessage}>A word for you <span aria-hidden="true">↗</span></button></motion.div>:<motion.div key="touch" className="center-content" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}><button className="heart-action" onClick={e=>{e.stopPropagation();reactToTouch(e);}}>Press me <span aria-hidden="true">♡</span></button><span className="quiet-note">{taps===0?'tap five times':`${5-taps} ${5-taps===1?'tap':'taps'} to go`}</span><span className="tap-dots" aria-hidden="true">{Array.from({length:5},(_,i)=><i className={i<taps?'filled':''} key={i}/>)}</span></motion.div>}</AnimatePresence>
  </motion.section>}</AnimatePresence>
 </main>;
}
