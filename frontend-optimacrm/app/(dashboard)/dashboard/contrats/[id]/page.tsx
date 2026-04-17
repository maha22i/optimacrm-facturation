'use client';

import { use } from 'react';
import ContratForm from '../_components/ContratForm';

export default function ContratDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <ContratForm contratId={parseInt(id)} />;
}
