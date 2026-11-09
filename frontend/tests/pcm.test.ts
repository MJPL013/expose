import {it,expect} from "vitest";
import {PCM16Resampler} from "../public/audio/pcm-resampler.mjs";
for(const rate of [44100,48000])it(`resamples ${rate} Hz into correctly paced mono PCM16 frames across arbitrary blocks`,()=>{
  const frames:ArrayBuffer[]=[];const processor=new PCM16Resampler(rate,frame=>frames.push(frame));const samples=new Float32Array(rate*2).fill(.5);
  for(let i=0;i<samples.length;i+=128)processor.push(samples.subarray(i,i+128));expect(frames.length).toBe(62);expect(frames.every(frame=>frame.byteLength===1024)).toBe(true);expect(new DataView(frames[0]).getInt16(0,true)).toBe(16384);expect(frames.length*.032).toBeCloseTo(1.984);
});
it("clamps PCM and averages channels upstream without integer overflow",()=>{const frames:ArrayBuffer[]=[];const processor=new PCM16Resampler(16000,frame=>frames.push(frame));processor.push(new Float32Array(512).fill(-2));expect(new DataView(frames[0]).getInt16(0,true)).toBe(-32768);});
