import { useState, useCallback } from 'react';
import type { OrganCategory } from '@seegak/human-body-map';

export interface OrganState {
  activeCategory: OrganCategory | null;
  hoveredId: string | null;
  selectedIds: string[];
  handleCategoryChange: (cat: OrganCategory | null) => void;
  handleHover: (id: string | null) => void;
  handleSelectionChange: (ids: string[]) => void;
}

export function useOrganState(): OrganState {
  const [activeCategory, setActiveCategory] = useState<OrganCategory | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const handleCategoryChange = useCallback((cat: OrganCategory | null) => {
    setActiveCategory(cat);
    setSelectedIds([]);
    setHoveredId(null);
  }, []);

  const handleHover = useCallback((id: string | null) => setHoveredId(id), []);

  const handleSelectionChange = useCallback((ids: string[]) => setSelectedIds(ids), []);

  return { activeCategory, hoveredId, selectedIds, handleCategoryChange, handleHover, handleSelectionChange };
}
