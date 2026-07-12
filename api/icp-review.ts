import { jsonRoute } from '../server/apiRoute'
import { runIcpReview } from '../server/icpReviewHandler'

export default jsonRoute(runIcpReview)
