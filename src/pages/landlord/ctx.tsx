import { createContext, useContext } from 'react'

export const LandlordCtx = createContext<any>(null)
export function useLCtx(): any {
  return useContext(LandlordCtx)
}
