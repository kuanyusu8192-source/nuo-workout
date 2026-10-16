import { render } from 'preact';
import './theme.css';
import './components/ui.css';
import './app/app.css';
import { Boot } from './app/Boot';
import { setupNative } from './app/native';

setupNative();

render(<Boot />, document.getElementById('app')!);
