import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: 24,
    paddingTop: 32,
    paddingBottom: 100,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 32,
    marginTop: 0,
  },
  card: {
    padding: 24,
    marginBottom: 24,
  },
  cardHeader: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 20,
    paddingBottom: 16,
  },
  statusContainer: {
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  ipText: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 24,
  },
  badge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 50,
    borderWidth: 1.5,
  },
  badgeText: {
    fontWeight: '700',
    fontSize: 14,
  },
  btn: {
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
  },
  btnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  accountInfoContainer: {
    backgroundColor: 'transparent',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
    backgroundColor: 'transparent',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
  value: {
    fontSize: 15,
    fontWeight: '600',
  },
  emptyText: {
    fontStyle: 'italic',
    textAlign: 'center',
    padding: 20,
    backgroundColor: 'transparent',
  },
  warningCardContent: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  warningIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  warningTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 12,
  },
  warningText: {
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 16,
    lineHeight: 22,
  },
  warningBox: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    width: '100%',
  },
  warningBoxText: {
    fontSize: 14,
    textAlign: 'center',
  },
  emptyStateContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  emptyStateIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyStateText: {
    fontSize: 15,
  },
});
