import { JSDOM } from 'jsdom';
import fs from 'fs';

// Fake out enough DOM to run React
const dom = new JSDOM('<!DOCTYPE html><div id="root"></div>');
global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;

// ... No wait, rendering React components with jsdom might require a full Babel transform.
// I can just log the `f` array!
