import { registerPageComponent } from '../componentRegistry';
import { renderProbeComponent } from './ProbeComponent';
import { renderSmartGrid } from './SmartGrid';

export function registerBuiltinPageComponents(): void {
  registerPageComponent({
    type: 'smartGrid',
    displayName: 'Smart Grid',
    render: renderSmartGrid,
  });
  registerPageComponent({
    type: 'probe',
    displayName: 'Registry Probe',
    render: renderProbeComponent,
  });
}
