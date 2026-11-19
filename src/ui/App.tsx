import { CellarPage } from './CellarPage.tsx';
import { ConsumedPage } from './ConsumedPage.tsx';
import { Footer } from './Footer.tsx';
import { HomePage, NotFoundPage } from './HomePage.tsx';
import { usePath } from './router.tsx';
import { ScoresPage } from './ScoresPage.tsx';

function Page() {
  switch (usePath()) {
    case '/':
      return <HomePage />;
    case '/cellar':
      return <CellarPage />;
    case '/consumed':
      return <ConsumedPage />;
    case '/scores':
      return <ScoresPage />;
    default:
      return <NotFoundPage />;
  }
}

/** Every page, with the footer they all share. */
export function App() {
  return (
    <>
      <Page />
      <Footer />
    </>
  );
}
