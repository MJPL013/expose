export class PCM16Resampler {
  constructor(inputRate:number,onFrame:(frame:ArrayBuffer)=>void);
  push(input:Float32Array):void;
}
