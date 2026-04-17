'use client';

import { use } from 'react';
import FicheProduit from '../_components/FicheProduit';

export default function EditProduitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <FicheProduit produitId={parseInt(id)} />;
}
