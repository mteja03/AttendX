import { describe, it, expect } from 'vitest';
import { buildOrgTree, treeDepth } from '../orgChartHelpers';

describe('buildOrgTree', () => {
  it('returns empty array for empty input', () => {
    expect(buildOrgTree([])).toEqual([]);
  });

  it('handles a single employee with no manager (single root)', () => {
    const emp = [{ id: '1', fullName: 'Alice', reportingManagerId: null }];
    const tree = buildOrgTree(emp);
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe('1');
    expect(tree[0].children).toEqual([]);
  });

  it('builds a simple two-level tree', () => {
    const employees = [
      { id: 'ceo', fullName: 'CEO', reportingManagerId: null },
      { id: 'vp', fullName: 'VP', reportingManagerId: 'ceo' },
    ];
    const tree = buildOrgTree(employees);
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe('ceo');
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].id).toBe('vp');
  });

  it('builds a three-level deep tree', () => {
    const employees = [
      { id: 'ceo', fullName: 'CEO', reportingManagerId: null },
      { id: 'vp', fullName: 'VP', reportingManagerId: 'ceo' },
      { id: 'mgr', fullName: 'Manager', reportingManagerId: 'vp' },
    ];
    const tree = buildOrgTree(employees);
    expect(tree[0].children[0].children[0].id).toBe('mgr');
  });

  it('single root: attaches orphans (manager not in dataset) under the root', () => {
    const employees = [
      { id: 'ceo', fullName: 'CEO', reportingManagerId: null },
      // ghost_mgr is not in the dataset
      { id: 'emp', fullName: 'Employee', reportingManagerId: 'ghost_mgr' },
    ];
    const tree = buildOrgTree(employees);
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe('ceo');
    const childIds = tree[0].children.map((c) => c.id);
    expect(childIds).toContain('emp');
  });

  it('multiple roots: does NOT fold orphans under one root, sorts by name', () => {
    const employees = [
      { id: 'a', fullName: 'Alice', reportingManagerId: null },
      { id: 'b', fullName: 'Bob', reportingManagerId: null },
      // orphan: manager missing
      { id: 'c', fullName: 'Charlie', reportingManagerId: 'ghost' },
    ];
    const tree = buildOrgTree(employees);
    // 2 true roots + 1 orphan = 3 top-level nodes, sorted by fullName
    expect(tree).toHaveLength(3);
    expect(tree[0].fullName).toBe('Alice');
    expect(tree[1].fullName).toBe('Bob');
    expect(tree[2].fullName).toBe('Charlie');
  });

  it('preserves extra employee fields on each node', () => {
    const employees = [
      { id: '1', fullName: 'Alice', reportingManagerId: null, department: 'Eng' },
    ];
    const tree = buildOrgTree(employees);
    expect(tree[0].department).toBe('Eng');
  });

  it('handles multiple children under one parent', () => {
    const employees = [
      { id: 'root', fullName: 'Root', reportingManagerId: null },
      { id: 'c1', fullName: 'Child1', reportingManagerId: 'root' },
      { id: 'c2', fullName: 'Child2', reportingManagerId: 'root' },
      { id: 'c3', fullName: 'Child3', reportingManagerId: 'root' },
    ];
    const tree = buildOrgTree(employees);
    expect(tree[0].children).toHaveLength(3);
  });
});

describe('treeDepth', () => {
  it('returns 0 for an empty roots array', () => {
    expect(treeDepth([])).toBe(0);
  });

  it('returns 1 for a single leaf node', () => {
    const roots = [{ id: '1', children: [] }];
    expect(treeDepth(roots)).toBe(1);
  });

  it('returns 2 for one level of children', () => {
    const roots = [{ id: '1', children: [{ id: '2', children: [] }] }];
    expect(treeDepth(roots)).toBe(2);
  });

  it('returns the max depth across multiple roots', () => {
    const roots = [
      {
        id: 'a',
        children: [
          { id: 'a1', children: [{ id: 'a2', children: [] }] },
        ],
      },
      {
        id: 'b',
        children: [{ id: 'b1', children: [] }],
      },
    ];
    // root a has depth 3, root b has depth 2
    expect(treeDepth(roots)).toBe(3);
  });

  it('measures depth correctly on a real buildOrgTree result', () => {
    const employees = [
      { id: 'ceo', fullName: 'CEO', reportingManagerId: null },
      { id: 'vp', fullName: 'VP', reportingManagerId: 'ceo' },
      { id: 'mgr', fullName: 'Manager', reportingManagerId: 'vp' },
      { id: 'emp', fullName: 'Employee', reportingManagerId: 'mgr' },
    ];
    const tree = buildOrgTree(employees);
    expect(treeDepth(tree)).toBe(4);
  });
});
