import React from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { circleDetailPath } from '@/lib/orgPaths';

/** /teams → /circles */
export function TeamsIndexRedirect() {
  return <Navigate to="/circles" replace />;
}

/** /teams/:teamId → /circles/:teamId */
export function LegacyTeamDetailRedirect() {
  const { teamId } = useParams();
  const { data: team, isLoading } = useQuery({
    queryKey: ['team', teamId],
    queryFn: () => base44.entities.Team.get(teamId),
    enabled: !!teamId,
  });

  if (isLoading || !teamId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  if (!team) {
    return <Navigate to="/" replace />;
  }

  return <Navigate to={circleDetailPath(teamId)} replace />;
}

/** Legacy /orgs/:orgId/teams/:teamId → /circles/:teamId */
export function LegacyOrgTeamDetailRedirect() {
  const { teamId } = useParams();
  if (!teamId) return <Navigate to="/circles" replace />;
  return <Navigate to={circleDetailPath(teamId)} replace />;
}
