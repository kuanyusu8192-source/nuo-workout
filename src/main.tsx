import { render } from 'preact';
import './theme.css';
import './components/ui.css';
import './app/app.css';
import { App } from './app/App';
import { bootstrap } from './app/bootstrap';
import { ReposProvider } from './app/context';
import { Skeleton } from './components/Skeleton';

const root = document.getElementById('app')!;
render(<Skeleton height={48} lines={4} label="資料庫載入中" />, root);

bootstrap().then(
  (repos) =>
    render(
      <ReposProvider repos={repos}>
        <App />
      </ReposProvider>,
      root,
    ),
  (err) => {
    console.error(err);
    root.textContent = `啟動失敗：${err instanceof Error ? err.message : String(err)}`;
  },
);
