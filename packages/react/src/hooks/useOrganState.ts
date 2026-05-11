import { useState, useCallback } from 'react';
import type { OrganCategory } from '@seegak/human-body-map';

export interface OrganState {
  activeCategory: OrganCategory | null;
  hoveredId: string | null;
  selectedId: string | null;
  handleCategoryChange: (cat: OrganCategory | null) => void;
  handleHover: (id: string | null) => void;
  handleSelect: (id: string) => void;
}

export function useOrganState(): OrganState {
  const [activeCategory, setActiveCategory] = useState<OrganCategory | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleCategoryChange = useCallback((cat: OrganCategory | null) => {
    setActiveCategory(cat);
    setSelectedId(null);
    setHoveredId(null);
  }, []);

  const handleHover = useCallback((id: string | null) => setHoveredId(id), []);

  const handleSelect = useCallback((id: string) => {
    setSelectedId(prev => (prev === id ? null : id));
  }, []);

  return { activeCategory, hoveredId, selectedId, handleCategoryChange, handleHover, handleSelect };
}
