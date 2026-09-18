import { TanStackDevtools } from '@tanstack/react-devtools';
import { formDevtoolsPlugin } from '@tanstack/react-form-devtools';

// Dev-only panel, loaded through React.lazy behind an `import.meta.env.DEV`
// gate in `src/routes/__root.tsx`, so production builds never fetch this chunk.
export default function Devtools() {
  return <TanStackDevtools plugins={[formDevtoolsPlugin()]} />;
}
