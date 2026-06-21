import { describe, it, expect, beforeEach } from "vitest";
import { useConnectionStore, getActiveConnection } from "./connection-store";

const STORAGE_KEY = "groqlab:connections";
const ACTIVE_KEY = "groqlab:activeId";

beforeEach(() => {
  localStorage.clear();
  useConnectionStore.setState({ connections: [], activeId: null });
});

function makeConn(overrides?: Record<string, unknown>) {
  return {
    id: "c1",
    name: "Test",
    projectId: "abc123",
    dataset: "production",
    createdAt: "2026-01-01T00:00:00Z",
    token: "",
    ...overrides,
  };
}

describe("connection-store", () => {
  it("starts with empty connections", () => {
    const { connections, activeId } = useConnectionStore.getState();
    expect(connections).toEqual([]);
    expect(activeId).toBeNull();
  });

  it("addConnection appends to list", () => {
    const conn = makeConn();
    useConnectionStore.getState().addConnection(conn);
    expect(useConnectionStore.getState().connections).toHaveLength(1);
    expect(useConnectionStore.getState().connections[0].id).toBe("c1");
  });

  it("addConnection persists to localStorage", () => {
    const conn = makeConn();
    useConnectionStore.getState().addConnection(conn);
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe("Test");
  });

  it("removeConnection deletes by id", () => {
    useConnectionStore.setState({
      connections: [makeConn({ id: "c1" }), makeConn({ id: "c2" })],
      activeId: null,
    });
    useConnectionStore.getState().removeConnection("c1");
    expect(useConnectionStore.getState().connections).toHaveLength(1);
    expect(useConnectionStore.getState().connections[0].id).toBe("c2");
  });

  it("removeConnection clears activeId if removing active", () => {
    useConnectionStore.setState({ connections: [makeConn()], activeId: "c1" });
    useConnectionStore.getState().removeConnection("c1");
    expect(useConnectionStore.getState().activeId).toBeNull();
  });

  it("removeConnection does not clear activeId if removing inactive", () => {
    useConnectionStore.setState({
      connections: [makeConn({ id: "c1" }), makeConn({ id: "c2" })],
      activeId: "c2",
    });
    useConnectionStore.getState().removeConnection("c1");
    expect(useConnectionStore.getState().activeId).toBe("c2");
  });

  it("removeConnection updates localStorage", () => {
    useConnectionStore.setState({ connections: [makeConn()], activeId: null });
    useConnectionStore.getState().removeConnection("c1");
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
    expect(stored).toHaveLength(0);
  });

  it("removeConnection removes activeId from localStorage", () => {
    localStorage.setItem(ACTIVE_KEY, "c1");
    useConnectionStore.setState({ connections: [makeConn()], activeId: "c1" });
    useConnectionStore.getState().removeConnection("c1");
    expect(localStorage.getItem(ACTIVE_KEY)).toBeNull();
  });

  it("setActive updates activeId", () => {
    useConnectionStore.getState().setActive("c1");
    expect(useConnectionStore.getState().activeId).toBe("c1");
  });

  it("setActive persists to localStorage", () => {
    useConnectionStore.getState().setActive("c1");
    expect(localStorage.getItem(ACTIVE_KEY)).toBe("c1");
  });

  it("setActive(null) clears activeId", () => {
    useConnectionStore.setState({ connections: [], activeId: "c1" });
    useConnectionStore.getState().setActive(null);
    expect(useConnectionStore.getState().activeId).toBeNull();
    expect(localStorage.getItem(ACTIVE_KEY)).toBeNull();
  });

  it("setConnections replaces list", () => {
    const conns = [makeConn({ id: "c1" }), makeConn({ id: "c2" })];
    useConnectionStore.getState().setConnections(conns);
    expect(useConnectionStore.getState().connections).toHaveLength(2);
  });

  it("setConnections persists to localStorage", () => {
    const conns = [makeConn()];
    useConnectionStore.getState().setConnections(conns);
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
    expect(stored).toHaveLength(1);
  });

  it("getActiveConnection returns null when no active", () => {
    expect(getActiveConnection()).toBeNull();
  });

  it("getActiveConnection returns the active connection", () => {
    const conn = makeConn();
    useConnectionStore.setState({ connections: [conn], activeId: "c1" });
    expect(getActiveConnection()).toEqual(conn);
  });

  it("getActiveConnection returns null when activeId not in list", () => {
    useConnectionStore.setState({ connections: [], activeId: "missing" });
    expect(getActiveConnection()).toBeNull();
  });

  it("updateConnection modifies existing connection", () => {
    const conn = makeConn();
    useConnectionStore.getState().addConnection(conn);
    useConnectionStore.getState().updateConnection("c1", { name: "Updated" });
    const updated = useConnectionStore.getState().connections[0];
    expect(updated.name).toBe("Updated");
    expect(updated.projectId).toBe("abc123");
  });

  it("updateConnection persists to localStorage", () => {
    const conn = makeConn();
    useConnectionStore.getState().addConnection(conn);
    useConnectionStore.getState().updateConnection("c1", { dataset: "staging" });
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
    expect(stored[0].dataset).toBe("staging");
  });

  it("updateConnection does nothing for unknown id", () => {
    useConnectionStore.getState().addConnection(makeConn());
    useConnectionStore.getState().updateConnection("unknown", { name: "Nope" });
    expect(useConnectionStore.getState().connections).toHaveLength(1);
    expect(useConnectionStore.getState().connections[0].name).toBe("Test");
  });

});
