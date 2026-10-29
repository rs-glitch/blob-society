// Entry module: build the 3D world, then start the UI shell (js/app.js) with it.
import { createWorld } from './world.js';

const canvas = document.getElementById('gl');
try {
  BS.readPal();
  BS.startApp(createWorld(canvas, document.getElementById('labels')));
} catch (e) {
  document.getElementById('status').textContent = 'This browser cannot show the 3D world (WebGL is off).';
  throw e;
}
