import React, { useEffect, useState, useCallback } from 'react';
import {
  ObsSetTree as ObsSetTreeModel,
  type ObsSetNode, type ObsSetSelection,
} from '@seegak/analysis';

export interface ObsSetTreeProps {
  tree: ObsSetTreeModel;
  onSelectionChange?: (selection: ObsSetSelection) => void;
  style?: React.CSSProperties;
  className?: string;
}

interface NodeRowProps {
  node: ObsSetNode;
  path: string[];
  depth: number;
  selectedPaths: string[][];
  onToggle: (path: string[], append: boolean) => void;
}

function pathKey(path: string[]): string {
  return path.join('\x00');
}

function NodeRow({ node, path, depth, selectedPaths, onToggle }: NodeRowProps): React.ReactElement {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children && node.children.length > 0;
  const currentKey = pathKey(path);
  const isSelected = selectedPaths.some((p) => pathKey(p) === currentKey);

  const handleCheckbox = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onToggle(path, e.nativeEvent instanceof MouseEvent ? (e.nativeEvent as MouseEvent).shiftKey : false);
    },
    [path, onToggle],
  );

  const handleExpandToggle = useCallback(() => {
    setExpanded((v) => !v);
  }, []);

  const indentPx = depth * 16;

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          paddingLeft: indentPx,
          paddingTop: 2,
          paddingBottom: 2,
          cursor: 'pointer',
          backgroundColor: isSelected ? 'rgba(59,130,246,0.15)' : undefined,
          borderRadius: 3,
        }}
      >
        {/* Expand/collapse arrow */}
        {hasChildren ? (
          <button
            onClick={handleExpandToggle}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              width: 16,
              fontSize: 10,
              color: '#94a3b8',
              flexShrink: 0,
            }}
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? '▼' : '▶'}
          </button>
        ) : (
          <span style={{ width: 16, flexShrink: 0 }} />
        )}

        {/* Selection checkbox */}
        <input
          type="checkbox"
          checked={isSelected}
          onChange={handleCheckbox}
          style={{ flexShrink: 0 }}
        />

        {/* Color circle */}
        {node.color != null && (
          <span
            style={{
              display: 'inline-block',
              width: 10,
              height: 10,
              borderRadius: '50%',
              backgroundColor: node.color,
              flexShrink: 0,
            }}
          />
        )}

        {/* Node name */}
        <span style={{ fontSize: 13, color: '#e2e8f0', flex: 1, userSelect: 'none' }}>
          {node.name}
        </span>

        {/* Obs count badge */}
        {node.obsIndices != null && (
          <span style={{ fontSize: 11, color: '#64748b', marginRight: 4 }}>
            {node.obsIndices.length}
          </span>
        )}
      </div>

      {/* Recursive children */}
      {hasChildren && expanded &&
        node.children!.map((child) => (
          <NodeRow
            key={child.name}
            node={child}
            path={[...path, child.name]}
            depth={depth + 1}
            selectedPaths={selectedPaths}
            onToggle={onToggle}
          />
        ))}
    </>
  );
}

export function ObsSetTree({
  tree,
  onSelectionChange,
  style,
  className,
}: ObsSetTreeProps): React.ReactElement {
  const [selectedPaths, setSelectedPaths] = useState<string[][]>(
    () => tree.getSelection().selectedPaths,
  );

  useEffect(() => {
    const unsub = tree.onSelectionChanged((selection) => {
      setSelectedPaths(selection.selectedPaths);
      onSelectionChange?.(selection);
    });
    return unsub;
  }, [tree, onSelectionChange]);

  const handleToggle = useCallback(
    (path: string[], append: boolean) => {
      const key = pathKey(path);
      const isSelected = tree.getSelection().selectedPaths.some((p) => pathKey(p) === key);
      if (isSelected) {
        tree.deselect(path);
      } else {
        tree.select(path, append);
      }
    },
    [tree],
  );

  const root = tree.getRoot();

  return (
    <div
      className={className}
      style={{
        overflowY: 'auto',
        fontFamily: 'sans-serif',
        padding: '4px 8px',
        ...style,
      }}
    >
      {/* Root node children are rendered directly if root has children */}
      {root.children && root.children.length > 0
        ? root.children.map((child) => (
            <NodeRow
              key={child.name}
              node={child}
              path={[child.name]}
              depth={0}
              selectedPaths={selectedPaths}
              onToggle={handleToggle}
            />
          ))
        : (
            <NodeRow
              node={root}
              path={[root.name]}
              depth={0}
              selectedPaths={selectedPaths}
              onToggle={handleToggle}
            />
          )}
    </div>
  );
}
