import './styles/app.css';
import './styles/ui.css';
import { App } from './app.js';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;

const app = new App(canvas, ui);
app.start();
