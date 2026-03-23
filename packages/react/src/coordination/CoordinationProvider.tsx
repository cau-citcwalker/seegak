import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { CoordinationSpace, type CoordinationSpec } from '@seegak/coordination';

const CoordinationContext = createContext<CoordinationSpace | null>(null);

export function CoordinationProvider({
  spec,
  children,
}: {
  spec: CoordinationSpec;
  children: React.ReactNode;
}): React.ReactElement {
  const space = useMemo(() => {
    const s = new CoordinationSpace();
    s.initFromSpec(spec);
    return s;
  // CoordinationSpace is initialised once per mount; spec changes are ignored
  // by design — consumers should remount to reset the entire space.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <CoordinationContext.Provider value={space}>
      {children}
    </CoordinationContext.Provider>
  );
}

export function useCoordination<T>(
  type: string,
  scope: string,
): [T | undefined, (value: T) => void] {
  const space = useContext(CoordinationContext);
  const [value, setValue] = useState<T | undefined>(() => space?.get<T>(type, scope));

  useEffect(() => {
    if (!space) return;
    return space.subscribe<T>(type, scope, (v) => setValue(v));
  }, [space, type, scope]);

  const setter = (v: T): void => { space?.set(type, scope, v); };

  return [value, setter];
}
