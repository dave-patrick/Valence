import { Suspense, lazy } from 'react'
import { createContext } from 'react'

// just a re-export shim
export { WorkspaceContext, useWorkspace, cachedRead, type WorkspaceState } from './useWorkspace'