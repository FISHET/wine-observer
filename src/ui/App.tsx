import { CellarPage } from './CellarPage.tsx';
import { ConsumedPage } from './ConsumedPage.tsx';
import { HomePage, NotFoundPage } from './HomePage.tsx';
import { usePath } from './router.tsx';

export function App() {
  switch (usePath()) {
    case '/':
      return <HomePage />;
    case '/cellar':
      return <CellarPage />;
    case '/consumed':
      return <ConsumedPage />;
    default:
      return <NotFoundPage />;
  }
}
