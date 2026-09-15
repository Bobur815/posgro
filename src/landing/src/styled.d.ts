import 'styled-components';
import { Theme } from '@theme/themes';

// Same augmentation the dashboard uses, so `theme.colors.…` inside styled templates typechecks
// against the shared POS theme rather than styled-components' empty DefaultTheme.
declare module 'styled-components' {
  export interface DefaultTheme extends Theme {}
}
