import { serverApi } from "@/lib/api/server";

import { ConnectedAppsView } from "./connected-apps-view";

// Connected apps list page: fetches server-side, renders the client view.
export default async function ConnectedAppsPage() {
  const apps = await serverApi.listConnectedApps();

  return <ConnectedAppsView apps={apps} />;
}
