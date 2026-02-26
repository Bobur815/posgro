import 'styled-components';
import { Theme } from '@theme/themes';

declare module 'styled-components' {
  export interface DefaultTheme extends Theme {}
}
