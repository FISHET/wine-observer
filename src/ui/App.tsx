import { CellarPage } from './CellarPage.tsx';
import { HomePage, NotFoundPage } from './HomePage.tsx';
import { NotesPage } from './NotesPage.tsx';
import { usePath } from './router.tsx';

export function App() {
  switch (usePath()) {
    case '/':
      return <HomePage />;
    case '/cellar':
      return <CellarPage />;
    case '/notes':
      return <NotesPage />;
    default:
      return <NotFoundPage />;
  }
}
