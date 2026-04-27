import { createContext, useContext, type ReactNode } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';

type WorkspaceRole = 'owner' | 'admin' | 'editor';

interface WorkspaceInfo {
  _id: Id<'workspaces'>;
  name: string;
  slug: string;
  tier?: string;
  role: WorkspaceRole;
}

interface WorkspaceCtxValue {
  workspace: WorkspaceInfo | null | undefined;
  allWorkspaces: WorkspaceInfo[] | undefined;
  switchWorkspace: (id: Id<'workspaces'>) => Promise<void>;
  isLoading: boolean;
}

const WorkspaceCtx = createContext<WorkspaceCtxValue>({
  workspace: undefined,
  allWorkspaces: undefined,
  switchWorkspace: async () => {},
  isLoading: true,
});

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const workspace = useQuery(api.workspaces.getActiveWorkspace);
  const allWorkspaces = useQuery(api.workspaces.listMyWorkspaces);
  const doSwitch = useMutation(api.workspaces.switchWorkspace);

  const switchWorkspace = async (id: Id<'workspaces'>) => {
    await doSwitch({ workspaceId: id });
  };

  const isLoading = workspace === undefined;

  return (
    <WorkspaceCtx.Provider value={{ workspace, allWorkspaces, switchWorkspace, isLoading }}>
      {children}
    </WorkspaceCtx.Provider>
  );
}

export function useWorkspace() {
  return useContext(WorkspaceCtx);
}
