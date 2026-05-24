// main.js — entry point loaded by index.html
import './styles.css';
import { init, wireEvents, setupBraveFooterHiding } from './dial.js';

setupBraveFooterHiding();
wireEvents();
init();
