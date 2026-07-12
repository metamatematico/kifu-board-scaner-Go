declare global {
  interface Window {
    cv: any;
  }
}

let cvPromise: Promise<any> | null = null;

// opencv.js is a ~8MB WASM payload; only fetch it when the corner-adjustment
// step actually runs, and only once per session.
export function getOpenCv(): Promise<any> {
  if (!cvPromise) {
    cvPromise = import("@techstark/opencv-js").then(async (mod) => {
      const cvModule: any = mod.default;
      let cv: any;
      if (cvModule instanceof Promise) {
        cv = await cvModule;
      } else if (cvModule.Mat) {
        cv = cvModule;
      } else {
        cv = await new Promise((resolve) => {
          cvModule.onRuntimeInitialized = () => resolve(cvModule);
        });
      }
      window.cv = cv;
      return cv;
    });
  }
  return cvPromise;
}

export {};
