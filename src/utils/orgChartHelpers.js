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
  const roots = [];
  employees.forEach((e) => {
    if (e.reportingManagerId && empMap[e.reportingManagerId]) {
      empMap[e.reportingManagerId].children.push(empMap[e.id]);
    } else {
      roots.push(empMap[e.id]);
    }
  });
  return roots;
}

function maxDepth(node, d = 1) {
  if (!node.children?.length) return d;
  return Math.max(...node.children.map((c) => maxDepth(c, d + 1)));
}

export function treeDepth(roots) {
  if (!roots.length) return 0;
  return Math.max(...roots.map((r) => maxDepth(r, 1)));
}
