// action.setIcon needs packaged file paths, including for small PNGs.
import light16 from '../../icons/light/icon-16.png?no-inline'
import light32 from '../../icons/light/icon-32.png?no-inline'
import light48 from '../../icons/light/icon-48.png?no-inline'
import light128 from '../../icons/light/icon-128.png?no-inline'
import dark16 from '../../icons/dark/icon-16.png?no-inline'
import dark32 from '../../icons/dark/icon-32.png?no-inline'
import dark48 from '../../icons/dark/icon-48.png?no-inline'
import dark128 from '../../icons/dark/icon-128.png?no-inline'

export const iconAssets = {
  light: { 16: light16, 32: light32, 48: light48, 128: light128 },
  dark: { 16: dark16, 32: dark32, 48: dark48, 128: dark128 },
}

export type IconTheme = keyof typeof iconAssets
