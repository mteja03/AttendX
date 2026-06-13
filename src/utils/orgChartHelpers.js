export function getDeptColor(dept) {
  const colors = {
    Engineering: '#3B82F6',
    HR: '#10B981',
    Sales: '#F59E0B',
    Finance: '#6366F1',
    Operations: '#EC4899',
    Marketing: '#14B8A6',
    Design: '#8B5CF6',
    Legal: '#64748B',
  };
  return colors[dept] || '#9CA3AF';
}

export function buildOrgTree(employees) {
  const empMap = {};
  employees.forEach((e) => {
    empMap[e.id] = { ...e, children: [] };
  });

  const trueRoots = [];   // no reportingManagerId at all
  const orphans = [];     // reportingManagerId set but manager not in dataset

  employees.forEach((e) => {
    if (!e.reportingManagerId) {
      trueRoots.push(empMap[e.id]);
    } else if (empMap[e.reportingManagerId]) {
      empMap[e.reportingManagerId].children.push(empMap[e.id]);
    } else {
      orphans.push(empMap[e.id]);
    }
  });

  // If we have exactly one true root, attach orphans under it
  if (trueRoots.length === 1 && orphans.length > 0) {
    orphans.forEach((o) => trueRoots[0].children.push(o));
    return trueRoots;
  }

  // Multiple true roots or no roots — fall back: merge orphans in, sort by name
  return [...trueRoots, ...orphans].sort((a, b) =>
    (a.fullName || '').localeCompare(b.fullName || '')
  );
}

function maxDepth(node, d = 1) {
  if (!node.children?.length) return d;
  return Math.max(...node.children.map((c) => maxDepth(c, d + 1)));
}

export function treeDepth(roots) {
  if (!roots.length) return 0;
  return Math.max(...roots.map((r) => maxDepth(r, 1)));
}
